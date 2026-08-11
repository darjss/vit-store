import type { QueryClient } from "@tanstack/solid-query";

import { productKeys } from "./queries";
import type {
	InstantSearchItem,
	ProductDetail,
	ProductListItem,
} from "./types";

type ListPage = { products: ProductListItem[]; pagination: unknown };

const INSTANT_PREFIX = [...productKeys.all, "instant"] as const;

interface SnapshotEntry {
	queryKey: readonly unknown[];
	data: unknown;
}

function snapshotCaches(
	queryClient: QueryClient,
	keys: Array<readonly unknown[]>,
): SnapshotEntry[] {
	const snapshot: SnapshotEntry[] = [];
	for (const key of keys) {
		for (const [queryKey, data] of queryClient.getQueriesData({
			queryKey: key,
		})) {
			if (data !== undefined) {
				snapshot.push({ queryKey, data });
			}
		}
	}
	return snapshot;
}

function restoreCaches(queryClient: QueryClient, snapshot: SnapshotEntry[]) {
	for (const entry of snapshot) {
		queryClient.setQueryData(entry.queryKey, entry.data);
	}
}

function patchListPages(
	queryClient: QueryClient,
	patch: (page: ListPage) => ListPage,
) {
	queryClient.setQueriesData({ queryKey: productKeys.lists() }, (old) => {
		const page = old as ListPage | undefined;
		return page && Array.isArray(page.products) ? patch(page) : page;
	});
}

/**
 * Optimistically set a product's stock in every cached surface (all list
 * pages, instant-search results, and the detail). Returns a rollback that
 * restores the previous cache values — call it from the mutation's onError.
 */
export function applyStockToCaches(
	queryClient: QueryClient,
	id: number,
	newStock: number,
): () => void {
	const snapshot = snapshotCaches(queryClient, [
		productKeys.lists(),
		INSTANT_PREFIX,
		productKeys.detail(id),
	]);

	patchListPages(queryClient, (page) => ({
		...page,
		products: page.products.map((p) =>
			p.id === id ? { ...p, stock: newStock } : p,
		),
	}));
	queryClient.setQueriesData({ queryKey: INSTANT_PREFIX }, (old) =>
		(old as InstantSearchItem[] | undefined)?.map((p) =>
			p.id === id ? { ...p, stock: newStock } : p,
		),
	);
	queryClient.setQueryData(productKeys.detail(id), (old) =>
		old && (old as ProductDetail).id === id
			? { ...(old as ProductDetail), stock: newStock }
			: old,
	);

	return () => restoreCaches(queryClient, snapshot);
}

/**
 * Merge an authoritative saved product (add/update response) into the detail
 * cache and every list/instant-search surface so list, detail, and search
 * agree after a write. Falls back to invalidation when the entity is missing.
 */
export function applyProductToCaches(
	queryClient: QueryClient,
	product: ProductDetail,
) {
	queryClient.setQueryData(productKeys.detail(product.id), product);
	patchListPages(queryClient, (page) => ({
		...page,
		products: page.products.map((p) =>
			p.id === product.id ? mergeProductFields(p, product) : p,
		),
	}));
	queryClient.setQueriesData({ queryKey: INSTANT_PREFIX }, (old) =>
		(old as InstantSearchItem[] | undefined)?.map((p) =>
			p.id === product.id
				? {
						id: p.id,
						name: product.name,
						slug: product.slug,
						price: product.price,
						stock: product.stock,
						status: product.status,
						images: product.images.map((image) => ({ url: image.url })),
					}
				: p,
		),
	);
}

/**
 * The list page projects a different shape than the detail (no brand/category
 * relations, full image rows). Merge only the shared scalar fields so the
 * optimistic list stays consistent without cross-typing the projections.
 */
function mergeProductFields(
	target: ProductListItem,
	source: ProductDetail,
): ProductListItem {
	return {
		...target,
		id: source.id,
		name: source.name,
		slug: source.slug,
		description: source.description,
		status: source.status,
		discount: source.discount,
		amount: source.amount,
		potency: source.potency,
		stock: source.stock,
		price: source.price,
		dailyIntake: source.dailyIntake,
		categoryId: source.categoryId,
		brandId: source.brandId,
		tags: source.tags,
		isFeatured: source.isFeatured,
		seoTitle: source.seoTitle,
		seoDescription: source.seoDescription,
		name_mn: source.name_mn,
		weightGrams: source.weightGrams,
		expirationDate: source.expirationDate,
		images: source.images as ProductListItem["images"],
	};
}

/**
 * Optimistically remove a product from every cached surface (soft delete).
 * Returns a rollback for onError.
 */
export function removeProductFromCaches(
	queryClient: QueryClient,
	id: number,
): () => void {
	const snapshot = snapshotCaches(queryClient, [
		productKeys.lists(),
		INSTANT_PREFIX,
	]);
	patchListPages(queryClient, (page) => ({
		...page,
		products: page.products.filter((p) => p.id !== id),
	}));
	queryClient.setQueriesData({ queryKey: INSTANT_PREFIX }, (old) =>
		(old as InstantSearchItem[] | undefined)?.filter((p) => p.id !== id),
	);
	queryClient.removeQueries({ queryKey: productKeys.detail(id) });
	return () => restoreCaches(queryClient, snapshot);
}

export function invalidateProductLists(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
		queryClient.invalidateQueries({ queryKey: INSTANT_PREFIX }),
	]);
}

export function invalidateProductDetail(queryClient: QueryClient, id: number) {
	return queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
}

/** After a write, refetch list + instant + detail so every surface agrees. */
export function invalidateProductsForWrite(
	queryClient: QueryClient,
	id?: number,
) {
	return Promise.all([
		invalidateProductLists(queryClient),
		id ? invalidateProductDetail(queryClient, id) : Promise.resolve(),
	]);
}
