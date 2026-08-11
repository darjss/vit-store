import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";

import { api } from "@/lib/trpc";
import type { ProductStatus } from "./types";

export interface ProductListFilters {
	brandId?: number;
	categoryId?: number;
	status?: ProductStatus;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
}

export interface InstantSearchFilters {
	query: string;
	brandId?: number;
	categoryId?: number;
	status?: ProductStatus;
}

export const PRODUCT_LIST_PAGE_SIZE = 9;

/** Hierarchical query keys (plan: query option factories + separate modules). */
export const productKeys = {
	all: ["products"] as const,
	lists: () => [...productKeys.all, "list"] as const,
	list: (filters: ProductListFilters) =>
		[...productKeys.lists(), filters] as const,
	instant: (filters: InstantSearchFilters) =>
		[...productKeys.all, "instant", filters] as const,
	detail: (id: number) => [...productKeys.all, "detail", id] as const,
	restockWait: (id: number) =>
		[...productKeys.all, "restock-wait", id] as const,
	brands: () => [...productKeys.all, "selectors", "brands"] as const,
	categories: () => [...productKeys.all, "selectors", "categories"] as const,
};

export function productListQueryOptions(filters: ProductListFilters) {
	return infiniteQueryOptions({
		queryKey: productKeys.list(filters),
		queryFn: ({ pageParam }) =>
			api.product.getPaginatedProducts.query({
				page: pageParam,
				pageSize: PRODUCT_LIST_PAGE_SIZE,
				brandId: filters.brandId,
				categoryId: filters.categoryId,
				status: filters.status,
				sortField: filters.sortField,
				sortDirection: filters.sortDirection,
				searchTerm: filters.searchTerm,
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.pagination.hasNextPage
				? lastPage.pagination.currentPage + 1
				: undefined,
		staleTime: 60_000,
	});
}

export function instantSearchQueryOptions(filters: InstantSearchFilters) {
	return queryOptions({
		queryKey: productKeys.instant(filters),
		queryFn: () =>
			api.product.searchProductsInstant.query({
				query: filters.query,
				limit: 10,
				brandId: filters.brandId,
				categoryId: filters.categoryId,
				status: filters.status,
			}),
		staleTime: 5 * 60_000,
	});
}

export function productDetailQueryOptions(id: number) {
	return queryOptions({
		queryKey: productKeys.detail(id),
		queryFn: () => api.product.getProductById.query({ id }),
	});
}

export function restockWaitCountQueryOptions(productId: number) {
	return queryOptions({
		queryKey: productKeys.restockWait(productId),
		queryFn: () => api.product.getRestockWaitCount.query({ productId }),
	});
}

export function brandsQueryOptions() {
	return queryOptions({
		queryKey: productKeys.brands(),
		queryFn: () => api.brands.getAllBrands.query(),
		staleTime: 15 * 60_000,
	});
}

export function categoriesQueryOptions() {
	return queryOptions({
		queryKey: productKeys.categories(),
		queryFn: () => api.category.getAllCategories.query(),
		staleTime: 15 * 60_000,
	});
}
