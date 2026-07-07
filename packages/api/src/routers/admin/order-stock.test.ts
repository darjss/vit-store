import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ env: {} }));

let latestPaymentStatus: string | undefined = "pending";
const updateStock =
	mock<(productId: number, quantity: number, type: "add" | "minus") => Promise<void>>(
		async () => {},
	);

mock.module("@vit/api/queries", () => ({
	customerQueries: { admin: {} },
	orderQueries: {
		admin: {
			getOrderDetailsByOrderId: async () => [
				{ productId: 1, quantity: 3, deletedAt: null },
				{ productId: 2, quantity: 5, deletedAt: null },
			],
			softDeleteOrder: async () => {},
			restoreOrder: async () => {},
		},
	},
	paymentQueries: {
		admin: {
			getLatestPaymentByOrderId: async () =>
				latestPaymentStatus === undefined
					? undefined
					: { status: latestPaymentStatus },
		},
	},
	productQueries: { admin: { updateStock } },
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
		updateStock.mockClear();
	});

	test("pending order: deleting restores no stock", async () => {
		latestPaymentStatus = "pending";
		await caller.deleteOrder({ id: 1 });
		expect(updateStock).not.toHaveBeenCalled();
	});

	test("paid order: deleting restores stock for every line", async () => {
		latestPaymentStatus = "success";
		await caller.deleteOrder({ id: 1 });
		expect(updateStock).toHaveBeenCalledTimes(2);
		expect(updateStock).toHaveBeenCalledWith(1, 3, "add");
		expect(updateStock).toHaveBeenCalledWith(2, 5, "add");
	});
});
