import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({ env: {} }));
mock.module("~/db/client", () => ({ db: () => ({}) }));

const { purchaseQueries } = await import("./purchases");
const { ProductsTable } = await import("~/db/schema");

const dialect = new PgDialect();

type ProductUpdate = { whereSql: string; whereParams: unknown[]; setParams: unknown[] };

const buildTx = (
	purchaseItems: Array<{
		id: number;
		productId: number;
		quantityOrdered: number;
		receiptItems: Array<{ quantityReceived: number }>;
	}>,
	productUpdates: ProductUpdate[],
) => {
	const awaitableValues = () => {
		const rows = [{ id: 999 }];
		const promise = Promise.resolve(rows);
		return {
			returning: async () => rows,
			// biome-ignore lint/suspicious/noThenProperty: fake awaitable drizzle chain
			then: promise.then.bind(promise),
		};
	};

	return {
		query: {
			PurchasesTable: {
				findFirst: async () => ({ id: 1, cancelledAt: null }),
			},
			PurchaseItemsTable: {
				findMany: async () => purchaseItems,
			},
		},
		insert: () => ({ values: awaitableValues }),
		update: (table: unknown) => ({
			set: (setObj: Record<string, unknown>) => ({
				where: async (cond: { getSQL: () => never }) => {
					if (table === ProductsTable) {
						const where = dialect.sqlToQuery(cond.getSQL());
						const set = dialect.sqlToQuery(
							(setObj.stock as { getSQL: () => never }).getSQL(),
						);
						productUpdates.push({
							whereSql: where.sql,
							whereParams: where.params,
							setParams: set.params,
						});
					}
				},
			}),
		}),
	} as never;
};

describe("receivePurchase — physical stock is credited even for soft-deleted products", () => {
	let productUpdates: ProductUpdate[];

	beforeEach(() => {
		productUpdates = [];
	});

	test("soft-deleted product still gets its stock incremented by the received quantity", async () => {
		const tx = buildTx(
			[{ id: 1, productId: 77, quantityOrdered: 10, receiptItems: [] }],
			productUpdates,
		);

		await purchaseQueries.admin.receivePurchase(tx, {
			purchaseId: 1,
			receivedAt: new Date(),
			notes: null,
			items: [{ purchaseItemId: 1, quantityReceived: 4 }],
		});

		expect(productUpdates).toHaveLength(1);
		const update = productUpdates[0];
		if (!update) throw new Error("expected a product stock update");
		expect(update.whereSql).not.toContain("deleted_at");
		expect(update.whereParams).toContain(77);
		expect(update.setParams).toContain(4);
	});
});
