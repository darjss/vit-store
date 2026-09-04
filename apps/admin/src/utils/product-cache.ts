import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { trpc } from "./trpc";

/**
 * Single place for "a product changed" invalidations. Every product write
 * (stock, price, fields, form save, delete) touches the same set of caches:
 * the admin infinite list, instant-search dropdowns, the all-products query,
 * and optionally the detail entry for one product.
 *
 * Stock/price card edits pass `skipInfiniteList` after an optimistic patch —
 * refetching the infinite list jumps the dash scroller to the top.
 */
export async function invalidateProductCaches(
	queryClient: QueryClient,
	productId?: number,
	options?: { skipInfiniteList?: boolean },
) {
	// Returns a promise that settles when every refetch triggered by these
	// invalidations has completed, so callers can await confirmed cache.
	await Promise.all([
		options?.skipInfiniteList
			? Promise.resolve()
			: queryClient.invalidateQueries({
					queryKey: ["admin-products-infinite"],
					type: "all",
				}),
		queryClient.invalidateQueries(
			trpc.product.searchProductsInstant.pathFilter(),
		),
		queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions()),
		productId !== undefined
			? queryClient.invalidateQueries(
					trpc.product.getProductById.queryOptions({ id: productId }),
				)
			: Promise.resolve(),
	]);
}

type CachedProductFields = {
	id: number;
	price: number;
	stock: number;
};

type ProductListPage = {
	products: Array<CachedProductFields>;
};

export type ProductCachePatch = {
	price?: number;
	stock?: number;
};

/** Optimistic write into list/detail caches so cards don't snap back to stale stock/price. */
export function patchProductInCaches(
	queryClient: QueryClient,
	productId: number,
	patch: ProductCachePatch,
) {
	queryClient.setQueriesData<InfiniteData<ProductListPage>>(
		{ queryKey: ["admin-products-infinite"] },
		(data) => {
			if (!data) {
				return data;
			}
			return {
				...data,
				pages: data.pages.map((page) => ({
					...page,
					products: page.products.map((product) =>
						product.id === productId ? { ...product, ...patch } : product,
					),
				})),
			};
		},
	);

	queryClient.setQueriesData<Array<CachedProductFields>>(
		{ queryKey: trpc.product.getAllProducts.queryKey() },
		(data) => {
			if (!data) {
				return data;
			}
			return data.map((product) =>
				product.id === productId ? { ...product, ...patch } : product,
			);
		},
	);

	queryClient.setQueriesData<CachedProductFields>(
		{ queryKey: trpc.product.getProductById.queryKey() },
		(data) => {
			if (!data || data.id !== productId) {
				return data;
			}
			return { ...data, ...patch };
		},
	);
}
