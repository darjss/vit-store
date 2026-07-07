import { describe, expect, mock, test } from "bun:test";
import type { ProductStatus } from "@vit/shared/constants";

// Stub out modules that touch Cloudflare bindings at import time so the
// query module can be loaded in a plain bun test environment.
mock.module("cloudflare:workers", () => ({
	env: {},
}));
mock.module("~/lib/product-search/client", () => ({
	searchProducts: () => Promise.resolve([]),
	rebuildProductSearchIndex: () => Promise.resolve(),
}));

const { productQueries } = await import("~/queries/products/index");
const { db } = await import("~/db/client");

type Conn = ReturnType<typeof db>;

/**
 * Minimal fake connection that records insert calls and lets us control
 * the chained drizzle query builder return values.
 */
function makeFakeConn(opts?: {
	productReturn?: unknown[];
	throwOnImagesInsert?: boolean;
}) {
	const calls: { table: unknown; values: unknown }[] = [];
	const conn = {
		insert(table: unknown) {
			const chain = {
				values(values: unknown) {
					const callIndex = calls.length;
					calls.push({ table, values });
					// Only the second insert (product images) is made to fail,
					// so the product insert can still resolve its .returning().
					if (opts?.throwOnImagesInsert && callIndex >= 1) {
						return Promise.reject(new Error("images insert failed"));
					}
					// .returning() is only used by createProduct
					return {
						returning: () => Promise.resolve(opts?.productReturn ?? []),
					};
				},
			};
			return chain;
		},
		_calls: calls,
	};
	return conn as unknown as Conn & {
		_calls: { table: unknown; values: unknown }[];
	};
}

const baseProductInput = {
	name: "x",
	slug: "x",
	description: "desc",
	discount: 0,
	amount: "60",
	potency: "500",
	stock: 1,
	price: 20000,
	dailyIntake: 1,
	categoryId: 1,
	brandId: 1,
	status: "active" as ProductStatus,
};

describe("productQueries.admin.createProductImages", () => {
	test("empty images array is a no-op (no insert issued)", async () => {
		const conn = makeFakeConn();
		await productQueries.admin.createProductImages(42, [], conn);
		expect(conn._calls.length).toBe(0);
	});

	test("non-empty images array issues a single insert with mapped values", async () => {
		const conn = makeFakeConn();
		await productQueries.admin.createProductImages(7, [
			{ url: "https://cdn.darjs.dev/a.webp", isPrimary: true },
			{ url: "https://cdn.darjs.dev/b.webp", isPrimary: false },
		], conn);
		expect(conn._calls.length).toBe(1);
		expect(conn._calls[0]?.values).toEqual([
			{ productId: 7, url: "https://cdn.darjs.dev/a.webp", isPrimary: true },
			{ productId: 7, url: "https://cdn.darjs.dev/b.webp", isPrimary: false },
		]);
	});
});

describe("productQueries.admin.createProduct", () => {
	test("uses the provided tx and returns the first row", async () => {
		const fakeProduct = { id: 99, name: "Acme Vit C 500 60" };
		const conn = makeFakeConn({ productReturn: [fakeProduct] });
		const result = await productQueries.admin.createProduct(
			baseProductInput,
			conn,
		);
		expect(result).toBe(fakeProduct);
		expect(conn._calls.length).toBe(1);
	});
});

describe("transaction rollback semantics for product create", () => {
	test("when image insert throws inside the tx callback, the error propagates (drizzle rolls back)", async () => {
		// Simulate the router's transaction pattern: create product, then
		// createProductImages throws -> the callback rejects -> drizzle rolls
		// back the product row.
		const conn = makeFakeConn({
			productReturn: [{ id: 1 }],
			throwOnImagesInsert: true,
		});

		const txWork = async () => {
			const created = await productQueries.admin.createProduct(
				baseProductInput,
				conn,
			);
			await productQueries.admin.createProductImages(
				created.id,
				[{ url: "https://cdn.darjs.dev/a.webp", isPrimary: true }],
				conn,
			);
			return created;
		};

		// Product row insert happened, but image insert rejects -> tx rejects.
		await expect(txWork()).rejects.toThrow("images insert failed");
		expect(conn._calls.length).toBe(2); // product insert + images insert attempt
	});

	test("imageless create succeeds without attempting an image insert", async () => {
		const conn = makeFakeConn({ productReturn: [{ id: 5 }] });
		const txWork = async () => {
			const created = await productQueries.admin.createProduct(
				baseProductInput,
				conn,
			);
			await productQueries.admin.createProductImages(created.id, [], conn);
			return created;
		};
		const created = await txWork();
		expect(created.id).toBe(5);
		expect(conn._calls.length).toBe(1); // only the product insert
	});
});
