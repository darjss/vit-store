import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ env: {} }));

let detailPrice: number | null = null;
const salesInserts: Array<Record<string, unknown>> = [];

const makeUpdateChain = (rows: unknown[]) => {
	const chain = {
		set: () => chain,
		where: () => chain,
		returning: async () => rows,
		// biome-ignore lint/suspicious/noThenProperty: fake awaitable drizzle chain
		then: (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown,
		) => Promise.resolve(rows).then(resolve, reject),
	};
	return chain;
};

const tx = {
	update: () => makeUpdateChain([{ id: 1, orderId: 42 }]),
	insert: () => ({
		values: async (values: Record<string, unknown>) => {
			salesInserts.push(values);
		},
	}),
	query: {
		OrderDetailsTable: {
			findMany: async () => [
				{
					quantity: 2,
					price: detailPrice,
					product: { id: 7, price: 99999, status: "active", stock: 10 },
				},
			],
		},
		PurchaseItemsTable: {
			findMany: async () => [],
		},
	},
};

mock.module("~/db/client", () => ({
	db: () => ({
		transaction: async (cb: (t: never) => unknown) => cb(tx as never),
	}),
}));

const { paymentQueries } = await import("./payments");

describe("confirmPaymentAndApplyStock — sales use the stored order-detail price", () => {
	beforeEach(() => {
		salesInserts.length = 0;
	});

	test("stored detail price wins over live catalog price", async () => {
		detailPrice = 30000;
		const confirmed = await paymentQueries.store.confirmPaymentAndApplyStock(
			"PAY1234567",
			"qpay",
		);
		expect(confirmed).toBe(true);
		expect(salesInserts).toHaveLength(1);
		expect(salesInserts[0]?.sellingPrice).toBe(30000);
	});

	test("legacy null detail price falls back to catalog price", async () => {
		detailPrice = null;
		const confirmed = await paymentQueries.store.confirmPaymentAndApplyStock(
			"PAY1234567",
			"qpay",
		);
		expect(confirmed).toBe(true);
		expect(salesInserts).toHaveLength(1);
		expect(salesInserts[0]?.sellingPrice).toBe(99999);
	});
});
