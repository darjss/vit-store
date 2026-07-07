import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ env: {} }));

const tx = {} as never;
mock.module("~/db/client", () => ({
	db: () => ({
		transaction: async (cb: (t: never) => unknown) => cb(tx),
	}),
}));

let latestPaymentStatus: string | undefined = "pending";
let orderDetails: Array<{
	productId: number;
	quantity: number;
	deletedAt: Date | null;
}> = [
	{ productId: 1, quantity: 3, deletedAt: null },
	{ productId: 2, quantity: 5, deletedAt: null },
];
const updateStockTx =
	mock<
		(
			tx: unknown,
			productId: number,
			quantity: number,
			type: "add" | "minus",
		) => Promise<void>
	>(async () => {});
const deleteOrderDetailsTx =
	mock<(tx: unknown, orderId: number) => Promise<void>>(async () => {});
const createOrderDetailsTx =
	mock<
		(
			tx: unknown,
			orderId: number,
			products: Array<{ productId: number; quantity: number }>,
		) => Promise<void>
	>(async () => {});
const updateOrderTx =
	mock<(tx: unknown, id: number, data: Record<string, unknown>) => Promise<void>>(
		async () => {},
	);

mock.module("@vit/api/queries", () => ({
	customerQueries: { admin: {} },
	orderQueries: {
		admin: {
			getOrderDetailsByOrderIdTx: async () => orderDetails,
			deleteOrderDetailsTx,
			createOrderDetailsTx,
			updateOrderTx,
			softDeleteOrderTx: async () => {},
			restoreOrderTx: async () => {},
		},
	},
	paymentQueries: {
		admin: {
			getLatestPaymentByOrderIdTx: async () =>
				latestPaymentStatus === undefined
					? undefined
					: { status: latestPaymentStatus },
			updatePaymentStatusTx: async () => {},
		},
	},
	productQueries: { admin: { updateStockTx } },
	purchaseQueries: { admin: {} },
	salesQueries: { admin: {} },
}));

const { buildOrderRouter } = await import("./order");
const { publicProcedure } = await import("~/lib/trpc");

const noop = () => {};
const ctx = {
	log: { set: noop, info: noop, warn: noop, error: noop },
} as never;

const caller = buildOrderRouter(publicProcedure).createCaller(ctx);

describe("deleteOrder — stock restored only when payment was successful", () => {
	beforeEach(() => {
		updateStockTx.mockClear();
		orderDetails = [
			{ productId: 1, quantity: 3, deletedAt: null },
			{ productId: 2, quantity: 5, deletedAt: null },
		];
	});

	test("pending order: deleting restores no stock", async () => {
		latestPaymentStatus = "pending";
		await caller.deleteOrder({ id: 1 });
		expect(updateStockTx).not.toHaveBeenCalled();
	});

	test("paid order: deleting restores stock for every line inside the transaction", async () => {
		latestPaymentStatus = "success";
		await caller.deleteOrder({ id: 1 });
		expect(updateStockTx).toHaveBeenCalledTimes(2);
		expect(updateStockTx).toHaveBeenCalledWith(tx, 1, 3, "add");
		expect(updateStockTx).toHaveBeenCalledWith(tx, 2, 5, "add");
	});
});

describe("restoreOrder — stock re-deducted only when payment was successful", () => {
	beforeEach(() => {
		updateStockTx.mockClear();
		orderDetails = [
			{ productId: 1, quantity: 3, deletedAt: new Date() },
			{ productId: 2, quantity: 5, deletedAt: new Date() },
		];
	});

	test("paid order: restoring re-deducts stock for every line inside the transaction", async () => {
		latestPaymentStatus = "success";
		await caller.restoreOrder({ id: 1 });
		expect(updateStockTx).toHaveBeenCalledTimes(2);
		expect(updateStockTx).toHaveBeenCalledWith(tx, 1, 3, "minus");
		expect(updateStockTx).toHaveBeenCalledWith(tx, 2, 5, "minus");
	});
});

describe("updateOrder — order-detail replacement is atomic with the update", () => {
	beforeEach(() => {
		deleteOrderDetailsTx.mockClear();
		createOrderDetailsTx.mockClear();
		updateOrderTx.mockClear();
		orderDetails = [{ productId: 1, quantity: 3, deletedAt: null }];
	});

	test("header is updated and details replaced on the transaction handle", async () => {
		latestPaymentStatus = "pending";
		await caller.updateOrder({
			id: 1,
			customerPhone: "99112233",
			address: "ulaanbaatar city",
			status: "pending",
			paymentStatus: "pending",
			deliveryProvider: "tu-delivery",
			isNewCustomer: false,
			products: [{ productId: 1, quantity: 3, price: 20000 }],
		});
		expect(updateOrderTx).toHaveBeenCalledWith(tx, 1, {
			customerPhone: 99112233,
			status: "pending",
			notes: undefined,
			total: 60000,
			address: "ulaanbaatar city",
			addressZoneId: null,
		});
		expect(deleteOrderDetailsTx).toHaveBeenCalledWith(tx, 1);
		expect(createOrderDetailsTx).toHaveBeenCalledWith(tx, 1, [
			{ productId: 1, quantity: 3 },
		]);
	});
});
