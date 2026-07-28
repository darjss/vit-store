import type { newOrderType } from "@vit/shared";

const STORAGE_KEY = "checkout:idempotency:v1";

type CheckoutAttempt = { requestHash: string; key: string };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type CheckoutIdempotencyDependencies = {
	storage: StorageLike;
	randomUUID: () => string;
	digest: (value: string) => Promise<string>;
};

const browserDigest = async (value: string) => {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const normalizedProducts = (products: newOrderType["products"]) => {
	const quantities = new Map<number, number>();
	for (const product of products) {
		const productId = Math.trunc(product.productId);
		const quantity = Math.trunc(product.quantity);
		quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
	}
	return [...quantities]
		.map(([productId, quantity]) => ({ productId, quantity }))
		.sort((left, right) => left.productId - right.productId);
};

const normalizedRequest = (input: newOrderType) =>
	JSON.stringify({
		phoneNumber: input.phoneNumber.trim(),
		address: input.address.trim(),
		addressZoneId: input.addressZoneId,
		notes: input.notes?.trim() || null,
		products: normalizedProducts(input.products),
	});

const readAttempt = (storage: StorageLike): CheckoutAttempt | null => {
	const raw = storage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<CheckoutAttempt>;
		return typeof value.requestHash === "string" &&
			typeof value.key === "string"
			? { requestHash: value.requestHash, key: value.key }
			: null;
	} catch {
		return null;
	}
};

export const addCheckoutIdempotency = async (
	input: newOrderType,
	dependencies: CheckoutIdempotencyDependencies = {
		storage: sessionStorage,
		randomUUID: () => crypto.randomUUID(),
		digest: browserDigest,
	},
): Promise<newOrderType> => {
	const requestHash = await dependencies.digest(normalizedRequest(input));
	const existing = readAttempt(dependencies.storage);
	const key =
		existing?.requestHash === requestHash
			? existing.key
			: `checkout_${dependencies.randomUUID()}`;
	dependencies.storage.setItem(
		STORAGE_KEY,
		JSON.stringify({ requestHash, key }),
	);
	return { ...input, idempotencyKey: key };
};

export const clearCheckoutIdempotency = (
	storage: Pick<Storage, "removeItem"> = sessionStorage,
) => storage.removeItem(STORAGE_KEY);
