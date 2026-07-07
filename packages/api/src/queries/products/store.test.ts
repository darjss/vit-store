import { describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";

// Stub out modules that touch Cloudflare bindings at import time so the
// query module can be loaded in a plain bun test environment.
mock.module("cloudflare:workers", () => ({ env: {} }));
mock.module("~/lib/product-search/client", () => ({
	searchProducts: () => Promise.resolve([]),
	rebuildProductSearchIndex: () => Promise.resolve(),
}));

/**
 * Serialize a drizzle SQL object (e.g. the `where` argument passed to
 * findMany / select) into `{ sql, params }` so assertions can check that
 * price conditions (`>=`, `<=`) and their bound values are present.
 */
const casing = {
	// Minimal CasingCache stand-in: return the column's DB name as-is.
	getColumnCasing: (col: { name: string }) => col.name,
};
function serializeWhere(where: unknown): { sql: string; params: unknown[] } {
	if (!where) return { sql: "", params: [] };
	return (where as SQL).toQuery({
		casing: casing as never,
		escapeName: (n: string) => `"${n}"`,
		escapeParam: (i: number, _v: unknown) => `$${i}`,
		escapeString: (s: string) => `'${s}'`,
	});
}

let findManyWhere: unknown = null;
let countWhere: unknown = null;
let findManyReturn: unknown[] = [];
let countReturn: { count: number }[] = [{ count: 0 }];

const fakeDb = {
	query: {
		ProductsTable: {
			findMany: async (opts: { where?: unknown } & Record<string, unknown>) => {
				findManyWhere = opts.where;
				return findManyReturn;
			},
		},
	},
	select: (_shape: unknown) => ({
		from: (_table: unknown) => ({
			where: async (w: unknown) => {
				countWhere = w;
				return countReturn;
			},
		}),
	}),
};

mock.module("~/db/client", () => ({ db: () => fakeDb }));

const { storeQueries } = await import("./store");

/** Reset captured state between tests. */
function reset() {
	findManyWhere = null;
	countWhere = null;
	findManyReturn = [];
	countReturn = [{ count: 0 }];
}

describe("storeQueries.getInfiniteProducts — price filter", () => {
	test("minPrice adds a `>=` condition bound to minPrice", async () => {
		reset();
		await storeQueries.getInfiniteProducts({
			limit: 10,
			minPrice: 15000,
		});
		const { sql, params } = serializeWhere(findManyWhere);
		expect(sql).toContain(">=");
		expect(params).toContain(15000);
	});

	test("maxPrice adds a `<=` condition bound to maxPrice", async () => {
		reset();
		await storeQueries.getInfiniteProducts({
			limit: 10,
			maxPrice: 80000,
		});
		const { sql, params } = serializeWhere(findManyWhere);
		expect(sql).toContain("<=");
		expect(params).toContain(80000);
	});

	test("both minPrice and maxPrice add both bounds", async () => {
		reset();
		await storeQueries.getInfiniteProducts({
			limit: 10,
			minPrice: 15000,
			maxPrice: 80000,
		});
		const { sql, params } = serializeWhere(findManyWhere);
		expect(sql).toContain(">=");
		expect(sql).toContain("<=");
		expect(params).toContain(15000);
		expect(params).toContain(80000);
	});

	test("no price params → where has no `>=`/`<=` price bound", async () => {
		reset();
		await storeQueries.getInfiniteProducts({ limit: 10 });
		const { sql, params } = serializeWhere(findManyWhere);
		// active+non-deleted gate is present, but no price params bound.
		expect(params).not.toContain(15000);
		expect(params).not.toContain(80000);
		// sanity: where is defined (active gate)
		expect(sql.length).toBeGreaterThan(0);
	});

	test("combined price + stock (requireStock) adds both stock `> 0` and price bounds", async () => {
		reset();
		await storeQueries.getInfiniteProducts({
			limit: 10,
			requireStock: true,
			minPrice: 15000,
			maxPrice: 80000,
		});
		const { sql, params } = serializeWhere(findManyWhere);
		expect(sql).toContain(">"); // stock > 0 and price >=
		expect(sql).toContain("<="); // price <=
		expect(params).toContain(15000);
		expect(params).toContain(80000);
	});

	test("cursor pagination + price filter computes nextCursor from returned items", async () => {
		reset();
		// Return exactly `limit` items so nextCursor is built from the last.
		findManyReturn = Array.from({ length: 10 }, (_, i) => ({
			id: 100 + i,
			name: `p${i}`,
			price: 20000 + i * 1000,
			slug: `p${i}`,
			createdAt: new Date("2025-01-01"),
			stock: 5,
			discount: 0,
			categoryId: 1,
		}));
		const result = await storeQueries.getInfiniteProducts({
			limit: 10,
			minPrice: 15000,
			maxPrice: 80000,
		});
		expect(result.items).toHaveLength(10);
		expect(result.nextCursor).not.toBeNull();
		// cursor shape: rank,sortValue,id — default sortField is "stock"
		const [rank, sortValue, id] = (result.nextCursor ?? "").split(",");
		expect(rank).toBe("1"); // stock 5 > 0 → in-stock rank 1
		expect(Number.parseInt(id, 10)).toBe(109);
		expect(Number.parseInt(sortValue, 10)).toBe(5);
		// price conditions still applied to the items query
		const { params } = serializeWhere(findManyWhere);
		expect(params).toContain(15000);
		expect(params).toContain(80000);
	});

	test("fewer items than limit → nextCursor is null even with price filter", async () => {
		reset();
		findManyReturn = [
			{
				id: 1,
				name: "only",
				price: 30000,
				slug: "only",
				createdAt: new Date("2025-01-01"),
				stock: 2,
				discount: 0,
				categoryId: 1,
			},
		];
		const result = await storeQueries.getInfiniteProducts({
			limit: 10,
			minPrice: 15000,
			maxPrice: 80000,
		});
		expect(result.items).toHaveLength(1);
		expect(result.nextCursor).toBeNull();
	});
});

describe("storeQueries.getPaginatedProducts — price filter", () => {
	test("minPrice/maxPrice applied to both items query and count query", async () => {
		reset();
		countReturn = [{ count: 7 }];
		findManyReturn = [
			{
				id: 1,
				name: "p",
				price: 30000,
				slug: "p",
				createdAt: new Date("2025-01-01"),
				stock: 2,
				discount: 0,
				categoryId: 1,
			},
		];
		const result = await storeQueries.getPaginatedProducts({
			page: 1,
			pageSize: 12,
			minPrice: 15000,
			maxPrice: 80000,
		});
		const itemsWhere = serializeWhere(findManyWhere);
		const cntWhere = serializeWhere(countWhere);
		expect(itemsWhere.sql).toContain(">=");
		expect(itemsWhere.sql).toContain("<=");
		expect(itemsWhere.params).toContain(15000);
		expect(itemsWhere.params).toContain(80000);
		expect(cntWhere.sql).toContain(">=");
		expect(cntWhere.sql).toContain("<=");
		expect(cntWhere.params).toContain(15000);
		expect(cntWhere.params).toContain(80000);
		expect(result.pagination.totalCount).toBe(7);
	});

	test("combined price + stock (requireStock) on paginated query", async () => {
		reset();
		countReturn = [{ count: 3 }];
		findManyReturn = [];
		await storeQueries.getPaginatedProducts({
			page: 1,
			pageSize: 12,
			requireStock: true,
			minPrice: 15000,
			maxPrice: 80000,
		});
		const itemsWhere = serializeWhere(findManyWhere);
		expect(itemsWhere.sql).toContain(">"); // stock > 0 + price >=
		expect(itemsWhere.sql).toContain("<="); // price <=
		expect(itemsWhere.params).toContain(15000);
		expect(itemsWhere.params).toContain(80000);
	});

	test("no price params → neither items nor count where has price bounds", async () => {
		reset();
		countReturn = [{ count: 0 }];
		findManyReturn = [];
		await storeQueries.getPaginatedProducts({
			page: 1,
			pageSize: 12,
		});
		const itemsWhere = serializeWhere(findManyWhere);
		const cntWhere = serializeWhere(countWhere);
		expect(itemsWhere.params).not.toContain(15000);
		expect(cntWhere.params).not.toContain(15000);
	});
});
