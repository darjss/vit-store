import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import {
	CheckoutIdempotencyTable,
	type CustomerSelectType,
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductsTable,
} from "~/db/schema";

export type CheckoutProduct = {
	id: number;
	name: string;
	price: number;
	stock: number;
	status: string;
};

export type CheckoutRecord = {
	keyHash?: string;
	requestHash?: string;
	notificationStatus?: "pending" | "sending" | "completed" | "ambiguous";
	orderId: number;
	orderNumber: string;
	paymentId: number;
	paymentNumber: string;
	total: number;
	customer: CustomerSelectType;
};

type CommitCheckoutInput = {
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

export const checkoutQueries = {
	async findByKeyHash(database: DB, keyHash: string) {
		const [row] = await database
			.select({
				keyHash: CheckoutIdempotencyTable.keyHash,
				requestHash: CheckoutIdempotencyTable.requestHash,
				notificationStatus: CheckoutIdempotencyTable.notificationStatus,
				orderId: OrdersTable.id,
				orderNumber: OrdersTable.orderNumber,
				paymentId: PaymentsTable.id,
				paymentNumber: PaymentsTable.paymentNumber,
				total: OrdersTable.total,
				customerPhone: OrdersTable.customerPhone,
			})
			.from(CheckoutIdempotencyTable)
			.innerJoin(
				OrdersTable,
				eq(CheckoutIdempotencyTable.orderId, OrdersTable.id),
			)
			.innerJoin(
				PaymentsTable,
				eq(CheckoutIdempotencyTable.paymentId, PaymentsTable.id),
			)
			.where(eq(CheckoutIdempotencyTable.keyHash, keyHash))
			.limit(1);
		if (!row) return null;

		const customer = await database.query.CustomersTable.findFirst({
			where: eq(CustomersTable.phone, row.customerPhone),
		});
		if (!customer) {
			throw new Error("Checkout replay customer is missing.");
		}
		return { ...row, customer } satisfies CheckoutRecord;
	},

	async getProducts(database: DB, productIds: number[]) {
		if (productIds.length === 0) return [];
		return await database
			.select({
				id: ProductsTable.id,
				name: ProductsTable.name,
				price: ProductsTable.price,
				stock: ProductsTable.stock,
				status: ProductsTable.status,
			})
			.from(ProductsTable)
			.where(inArray(ProductsTable.id, productIds));
	},

	async commit(database: DB, input: CommitCheckoutInput) {
		return await database.transaction(async (tx) => {
			const existingCustomer = await tx.query.CustomersTable.findFirst({
				where: eq(CustomersTable.phone, input.customerPhone),
			});
			const [customer] = existingCustomer
				? await tx
						.update(CustomersTable)
						.set({
							address: input.address,
							addressZoneId: input.addressZoneId,
						})
						.where(eq(CustomersTable.phone, input.customerPhone))
						.returning()
				: await tx
						.insert(CustomersTable)
						.values({
							phone: input.customerPhone,
							address: input.address,
							addressZoneId: input.addressZoneId,
						})
						.returning();
			if (!customer) throw new Error("No customer returned after checkout.");

			const [order] = await tx
				.insert(OrdersTable)
				.values({
					orderNumber: input.orderNumber,
					customerPhone: input.customerPhone,
					address: input.address,
					addressZoneId: input.addressZoneId,
					notes: input.notes,
					total: input.total,
					status: "created",
					deliveryProvider: "tu-delivery",
				})
				.returning({ id: OrdersTable.id });
			if (!order) throw new Error("No order returned after checkout.");

			await tx.insert(OrderDetailsTable).values(
				input.products.map((product) => ({
					orderId: order.id,
					productId: product.productId,
					quantity: product.quantity,
					price: product.price,
				})),
			);

			const [payment] = await tx
				.insert(PaymentsTable)
				.values({
					paymentNumber: input.paymentNumber,
					orderId: order.id,
					provider: "transfer",
					status: "pending",
					amount: input.total,
				})
				.returning({ id: PaymentsTable.id });
			if (!payment) throw new Error("No payment returned after checkout.");

			if (input.keyHash && input.requestHash) {
				await tx.insert(CheckoutIdempotencyTable).values({
					keyHash: input.keyHash,
					requestHash: input.requestHash,
					orderId: order.id,
					paymentId: payment.id,
				});
			}

			return {
				keyHash: input.keyHash,
				requestHash: input.requestHash,
				notificationStatus: input.keyHash ? ("pending" as const) : undefined,
				orderId: order.id,
				orderNumber: input.orderNumber,
				paymentId: payment.id,
				paymentNumber: input.paymentNumber,
				total: input.total,
				customer,
			} satisfies CheckoutRecord;
		});
	},

	async claimNotification(database: DB, keyHash: string) {
		const [claimed] = await database
			.update(CheckoutIdempotencyTable)
			.set({ notificationStatus: "sending" })
			.where(
				and(
					eq(CheckoutIdempotencyTable.keyHash, keyHash),
					eq(CheckoutIdempotencyTable.notificationStatus, "pending"),
				),
			)
			.returning({ id: CheckoutIdempotencyTable.id });
		return Boolean(claimed);
	},

	async setNotificationStatus(
		database: DB,
		keyHash: string,
		status: "completed" | "ambiguous",
	) {
		await database
			.update(CheckoutIdempotencyTable)
			.set({ notificationStatus: status })
			.where(
				and(
					eq(CheckoutIdempotencyTable.keyHash, keyHash),
					eq(CheckoutIdempotencyTable.notificationStatus, "sending"),
				),
			);
	},
};
