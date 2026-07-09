import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { logger } from "~/lib/logger";
import type {
	ProductSearchFilters,
	ProductSearchRebuildReason,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";
import { PRODUCT_SEARCH_OBJECT_NAME } from "~/lib/product-search/types";

const getProductSearchService = () =>
	env.PRODUCT_SEARCH.getByName(PRODUCT_SEARCH_OBJECT_NAME);

const PRODUCT_SEARCH_TIMEOUT_MS = 4000;
// Isolate-local warm cache for popular queries. Skips the DO RPC hop on
// repeated searches within the same Worker isolate. Short TTL so stock
// ranking drift stays bounded; not shared across isolates.
const SEARCH_RESULT_CACHE_TTL_MS = 30_000;
const SEARCH_RESULT_CACHE_MAX = 128;

type SearchResultCacheEntry = {
	expiresAt: number;
	value: SearchProductResult[];
};

const searchResultCache = new Map<string, SearchResultCacheEntry>();

const searchResultCacheKey = (
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

const readSearchResultCache = (key: string) => {
	const entry = searchResultCache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		searchResultCache.delete(key);
		return null;
	}
	// Refresh insertion order for a simple LRU-ish eviction.
	searchResultCache.delete(key);
	searchResultCache.set(key, entry);
	return entry.value;
};

const writeSearchResultCache = (key: string, value: SearchProductResult[]) => {
	if (searchResultCache.size >= SEARCH_RESULT_CACHE_MAX) {
		const oldest = searchResultCache.keys().next().value;
		if (oldest !== undefined) searchResultCache.delete(oldest);
	}
	searchResultCache.set(key, {
		expiresAt: Date.now() + SEARCH_RESULT_CACHE_TTL_MS,
		value,
	});
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(
				() => reject(new Error(`product_search timed out after ${ms}ms`)),
				ms,
			),
		),
	]);

export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
): Promise<SearchProductResult[]> => {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const cacheKey = searchResultCacheKey(trimmed, limit, filters);
	const cached = readSearchResultCache(cacheKey);
	if (cached) return cached;

	try {
		const results = await withTimeout(
			getProductSearchService().search({
				query: trimmed,
				limit,
				filters,
			}),
			PRODUCT_SEARCH_TIMEOUT_MS,
		);
		writeSearchResultCache(cacheKey, results);
		return results;
	} catch (error) {
		logger.error("product_search.search_failed", error);
		return [];
	}
};

export const clearProductSearchResultCache = (): void => {
	searchResultCache.clear();
};

const clearIsolateSearchCaches = (): void => {
	clearProductSearchResultCache();
	// Lazy import avoids a lib → router cycle (helpers import searchProducts).
	void import("~/routers/store/product-search-helpers")
		.then((m) => m.clearNavigationListsCache())
		.catch(() => undefined);
};

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	clearIsolateSearchCaches();
	const status = await getProductSearchService().rebuild(reason);
	clearIsolateSearchCaches();
	return status;
};

export const getProductSearchStatus =
	async (): Promise<ProductSearchStatus> => {
		return getProductSearchService().getStatus();
	};

export const clearProductSearchIndex = async () => {
	await getProductSearchService().clear();
	clearIsolateSearchCaches();
};

type RebuildContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<any>;
};

/**
 * Schedule a product-search rebuild in the background via `waitUntil` so the
 * caller's response is not blocked. Errors are logged, never thrown.
 * Clears the isolate-local warm result cache immediately so subsequent
 * searches do not serve pre-rebuild rankings while DO rebuild runs.
 */
export const scheduleProductSearchRebuild = (
	ctx: RebuildContext,
	reason: ProductSearchRebuildReason,
): void => {
	clearIsolateSearchCaches();
	ctx.c.executionCtx.waitUntil(
		rebuildProductSearchIndex(reason).catch((error) => {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "product_search.rebuild_failed",
				reason,
			});
		}),
	);
};
