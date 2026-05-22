import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";

export function buildActiveProductConditions(requireStock = false) {
	const conditions = [
		isNull(ProductsTable.deletedAt),
		eq(ProductsTable.status, "active"),
	];
	if (requireStock) {
		conditions.push(gt(ProductsTable.stock, 0));
	}
	return and(...conditions);
}

export async function hydrateProductsBySearchIds<T extends Record<string, unknown>>(
	ids: number[],
	queryFn: (ids: number[]) => Promise<T[]>,
	limit?: number,
): Promise<T[]> {
	if (ids.length === 0) return [];
	const products = await queryFn(ids);
	const byId = new Map(
		products.map((product) => [(product as unknown as { id: number }).id, product]),
	);
	const ordered = ids
		.map((id) => byId.get(id))
		.filter((product): product is T => !!product);
	return limit ? ordered.slice(0, limit) : ordered;
}

export async function searchProductIds(term: string, limit: number) {
	const trimmed = term.trim();
	if (!trimmed) return [] as number[];
	return (await searchProducts(trimmed, limit)).map((result) => result.id);
}
