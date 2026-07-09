import type {
	ProductSearchFilters,
	SearchProductResult,
} from "~/lib/product-search/types";
import { brandQueries } from "~/queries/brands";
import { categoryQueries } from "~/queries/categories";

// Isolate-local warm caches for search RPC results and nav brand/category
// lists. Both live here so rebuild/clear can drop them synchronously without
// a lib → router cycle. Not shared across isolates; short TTLs bound drift.

const SEARCH_RESULT_CACHE_TTL_MS = 30_000;
const SEARCH_RESULT_CACHE_MAX = 128;
const NAVIGATION_LIST_TTL_MS = 60_000;

type SearchResultCacheEntry = {
	expiresAt: number;
	value: SearchProductResult[];
};

const searchResultCache = new Map<string, SearchResultCacheEntry>();

export const searchResultCacheKey = (
	query: string,
	limit: number,
	filters?: ProductSearchFilters,
) =>
	JSON.stringify([
		query,
		limit,
		filters?.brandId ?? null,
		filters?.categoryId ?? null,
		filters?.requireStock ?? false,
	]);

export const readSearchResultCache = (key: string) => {
	const entry = searchResultCache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		searchResultCache.delete(key);
		return null;
	}
	searchResultCache.delete(key);
	searchResultCache.set(key, entry);
	return entry.value;
};

export const writeSearchResultCache = (
	key: string,
	value: SearchProductResult[],
) => {
	if (searchResultCache.size >= SEARCH_RESULT_CACHE_MAX) {
		const oldest = searchResultCache.keys().next().value;
		if (oldest !== undefined) searchResultCache.delete(oldest);
	}
	searchResultCache.set(key, {
		expiresAt: Date.now() + SEARCH_RESULT_CACHE_TTL_MS,
		value,
	});
};

export const clearProductSearchResultCache = (): void => {
	searchResultCache.clear();
};

type NavigationBrandRow = Awaited<
	ReturnType<typeof brandQueries.store.getAllBrands>
>[number];
type NavigationCategoryRow = Awaited<
	ReturnType<typeof categoryQueries.store.getAllCategories>
>[number];

type NavigationLists = {
	brands: NavigationBrandRow[];
	categories: NavigationCategoryRow[];
};

let navigationListsCache: (NavigationLists & { expiresAt: number }) | null =
	null;
let navigationListsInflight: Promise<NavigationLists> | null = null;

export const clearNavigationListsCache = (): void => {
	navigationListsCache = null;
	navigationListsInflight = null;
};

export const loadNavigationLists = async (): Promise<NavigationLists> => {
	const now = Date.now();
	if (navigationListsCache && navigationListsCache.expiresAt > now) {
		return navigationListsCache;
	}

	if (!navigationListsInflight) {
		navigationListsInflight = Promise.all([
			brandQueries.store.getAllBrands(),
			categoryQueries.store.getAllCategories(),
		])
			.then(([brands, categories]) => {
				navigationListsCache = {
					brands,
					categories,
					expiresAt: Date.now() + NAVIGATION_LIST_TTL_MS,
				};
				return { brands, categories };
			})
			.finally(() => {
				navigationListsInflight = null;
			});
	}

	return navigationListsInflight;
};

export const clearAllIsolateSearchCaches = (): void => {
	clearProductSearchResultCache();
	clearNavigationListsCache();
};
