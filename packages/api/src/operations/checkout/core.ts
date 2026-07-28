import type { CheckoutCreated, CheckoutError, newOrderType } from "@vit/shared";
import { deliveryFee } from "@vit/shared/constants";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { Result, type Result as ResultType } from "better-result";
import { isUniqueViolation } from "~/lib/payments/consumed-transaction";
import type { CheckoutProduct, CheckoutRecord } from "~/queries/checkout";

export type NormalizedCheckout = {
	phoneNumber: string;
	address: string;
	addressZoneId: number;
	notes: string | null;
	products: Array<{ productId: number; quantity: number }>;
	idempotencyKey?: string;
};

type CommitInput = {
	keyHash?: string;
	requestHash?: string;
	orderNumber: string;
	paymentNumber: string;
	customerPhone: number;
	address: string;
	addressZoneId: number;
	notes: string | null;
	total: number;
	products: Array<{ productId: number; quantity: number; price: number }>;
};

export type CheckoutOperationDependencies = {
	findByKeyHash: (keyHash: string) => Promise<CheckoutRecord | null>;
	getProducts: (productIds: number[]) => Promise<CheckoutProduct[]>;
	commit: (input: CommitInput) => Promise<CheckoutRecord>;
	createAccess: (
		record: CheckoutRecord,
		input: NormalizedCheckout,
	) => Promise<string>;
	runPostCommit: (
		record: CheckoutRecord,
		input: NormalizedCheckout,
	) => Promise<void>;
	generateOrderNumber: () => string;
	generatePaymentNumber: () => string;
	accountNumber: string;
	accountName: string;
};

const hash = (value: string) =>
	encodeHexLowerCase(sha256(new TextEncoder().encode(value)));

const normalizeCheckout = (input: newOrderType): NormalizedCheckout => {
	const productsById = new Map<number, number>();
	for (const item of input.products) {
		const productId = Math.trunc(item.productId);
		const quantity = Math.trunc(item.quantity);
		productsById.set(productId, (productsById.get(productId) ?? 0) + quantity);
	}
	return {
		phoneNumber: input.phoneNumber.trim(),
		address: input.address.trim(),
		addressZoneId: input.addressZoneId,
		notes: input.notes?.trim() || null,
		products: [...productsById]
			.map(([productId, quantity]) => ({ productId, quantity }))
			.sort((left, right) => left.productId - right.productId),
		idempotencyKey: input.idempotencyKey,
	};
};

export const checkoutRequestIdentity = (input: NormalizedCheckout) => ({
	keyHash: input.idempotencyKey
		? hash(`checkout:${input.idempotencyKey}`)
		: undefined,
	requestHash: input.idempotencyKey
		? hash(
				JSON.stringify({
					phoneNumber: input.phoneNumber,
					address: input.address,
					addressZoneId: input.addressZoneId,
					notes: input.notes,
					products: input.products,
				}),
			)
		: undefined,
});

const invalidCheckout = (fields: string[]): CheckoutError => ({
	_tag: "InvalidCheckoutDetails",
	message: "Захиалгын мэдээлэл дутуу эсвэл буруу байна.",
	fields,
});

const validateInput = (input: NormalizedCheckout): CheckoutError | null => {
	if (input.products.length === 0) {
		return { _tag: "CartEmpty", message: "Сагс хоосон байна." };
	}
	const invalidProducts = input.products.filter(
		(product) => product.productId <= 0 || product.quantity <= 0,
	);
	if (invalidProducts.length > 0) return invalidCheckout(["products"]);
	return null;
};

const validateProducts = (
	input: NormalizedCheckout,
	products: CheckoutProduct[],
): CheckoutError | null => {
	const byId = new Map(products.map((product) => [product.id, product]));
	for (const requested of input.products) {
		const product = byId.get(requested.productId);
		if (!product || product.status !== "active") {
			return {
				_tag: "ProductUnavailable",
				message: "Сонгосон бараа одоогоор захиалах боломжгүй байна.",
				productId: requested.productId,
				productName: product?.name,
			};
		}
	}
	const insufficient = input.products.flatMap((requested) => {
		const product = byId.get(requested.productId);
		return product && product.stock < requested.quantity
			? [
					{
						productId: product.id,
						productName: product.name,
						requested: requested.quantity,
						available: product.stock,
					},
				]
			: [];
	});
	return insufficient.length > 0
		? {
				_tag: "InsufficientStock",
				message: "Зарим барааны үлдэгдэл хүрэлцэхгүй байна.",
				items: insufficient,
			}
		: null;
};

const replay = (
	record: CheckoutRecord,
	requestHash: string,
): ResultType<CheckoutRecord, CheckoutError> =>
	record.requestHash === requestHash
		? Result.ok(record)
		: Result.err({
				_tag: "CheckoutKeyConflict",
				message: "Энэ оролдлогын мэдээлэл өмнөх хүсэлтээс өөр байна.",
			});

const completeCheckout = async (
	record: CheckoutRecord,
	input: NormalizedCheckout,
	dependencies: CheckoutOperationDependencies,
): Promise<ResultType<CheckoutCreated, CheckoutError>> => {
	let checkoutToken: string;
	try {
		checkoutToken = await dependencies.createAccess(record, input);
	} catch {
		return Result.err({
			_tag: "CheckoutRecoveryRequired",
			message:
				"Захиалга үүссэн боловч үргэлжлүүлэх холбоосыг бэлтгэж чадсангүй.",
			orderNumber: record.orderNumber,
		});
	}

	try {
		await dependencies.runPostCommit(record, input);
	} catch {
		// The order and payment are committed. Recovery state was persisted in the
		// checkout/payment rows before this post-commit work started.
	}

	return Result.ok({
		paymentNumber: record.paymentNumber,
		orderNumber: record.orderNumber,
		checkoutToken,
		total: record.total,
		customerPhone: input.phoneNumber,
		accountNumber: dependencies.accountNumber,
		accountName: dependencies.accountName,
	});
};

export const executeCheckout = async (
	inputValue: newOrderType,
	dependencies: CheckoutOperationDependencies,
): Promise<ResultType<CheckoutCreated, CheckoutError>> => {
	const input = normalizeCheckout(inputValue);
	const identity = checkoutRequestIdentity(input);
	if (identity.keyHash && identity.requestHash) {
		const existing = await dependencies.findByKeyHash(identity.keyHash);
		if (existing) {
			const replayed = replay(existing, identity.requestHash);
			return replayed.match({
				ok: (record) => completeCheckout(record, input, dependencies),
				err: (error) => Promise.resolve(Result.err(error)),
			});
		}
	}

	const inputError = validateInput(input);
	if (inputError) return Result.err(inputError);

	const products = await dependencies.getProducts(
		input.products.map((product) => product.productId),
	);
	const productError = validateProducts(input, products);
	if (productError) return Result.err(productError);
	const byId = new Map(products.map((product) => [product.id, product]));
	const total =
		input.products.reduce(
			(sum, product) =>
				sum + (byId.get(product.productId)?.price ?? 0) * product.quantity,
			0,
		) + deliveryFee;

	let record: CheckoutRecord;
	try {
		record = await dependencies.commit({
			keyHash: identity.keyHash,
			requestHash: identity.requestHash,
			orderNumber: dependencies.generateOrderNumber(),
			paymentNumber: dependencies.generatePaymentNumber(),
			customerPhone: Number(input.phoneNumber),
			address: input.address,
			addressZoneId: input.addressZoneId,
			notes: input.notes,
			total,
			products: input.products.map((product) => ({
				...product,
				price: byId.get(product.productId)?.price ?? 0,
			})),
		});
	} catch (error) {
		if (
			!identity.keyHash ||
			!identity.requestHash ||
			!isUniqueViolation(error)
		) {
			throw error;
		}
		const concurrent = await dependencies.findByKeyHash(identity.keyHash);
		if (!concurrent) throw error;
		const replayed = replay(concurrent, identity.requestHash);
		return replayed.match({
			ok: (value) => completeCheckout(value, input, dependencies),
			err: (failure) => Promise.resolve(Result.err(failure)),
		});
	}

	return completeCheckout(record, input, dependencies);
};
