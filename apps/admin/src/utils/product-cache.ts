import type { QueryClient } from "@tanstack/react-query";
import { trpc } from "./trpc";

/**
 * Single place for "a product changed" invalidations. Every product write
 * (stock, price, fields, form save, delete) touches the same set of caches:
 * the admin infinite list, instant-search dropdowns, the all-products query,
 * and optionally the detail entry for one product. Invalidate all of them or
 * none — patching some is how stale stock/price leaked between views.
 */
export async function invalidateProductCaches(queryClient: QueryClient, productId?: number) {
	// Returns a promise that settles when every refetch triggered by these
	// invalidations has completed, so callers can await confirmed cache.
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: ["admin-products-infinite"],
			type: "all",
		}),
		queryClient.invalidateQueries(trpc.product.searchProductsInstant.pathFilter()),
		queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions()),
		productId !== undefined
			? queryClient.invalidateQueries(trpc.product.getProductById.queryOptions({ id: productId }))
			: Promise.resolve(),
	]);
}
