import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { logger } from "~/lib/logger";
import {
	clearAllIsolateSearchCaches,
	clearProductSearchResultCache,
	readSearchResultCache,
	searchResultCacheKey,
	writeSearchResultCache,
} from "~/lib/product-search/isolate-cache";
import type {
	ProductSearchFilters,
	ProductSearchRebuildReason,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";
import { PRODUCT_SEARCH_OBJECT_NAME } from "~/lib/product-search/types";

export { clearProductSearchResultCache };

const getProductSearchService = () =>
	env.PRODUCT_SEARCH.getByName(PRODUCT_SEARCH_OBJECT_NAME);

const PRODUCT_SEARCH_TIMEOUT_MS = 4000;

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

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	clearAllIsolateSearchCaches();
	const status = await getProductSearchService().rebuild(reason);
	clearAllIsolateSearchCaches();
	return status;
};

export const getProductSearchStatus =
	async (): Promise<ProductSearchStatus> => {
		return getProductSearchService().getStatus();
	};

export const clearProductSearchIndex = async () => {
	await getProductSearchService().clear();
	clearAllIsolateSearchCaches();
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
	clearAllIsolateSearchCaches();
	ctx.c.executionCtx.waitUntil(
		rebuildProductSearchIndex(reason).catch((error) => {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "product_search.rebuild_failed",
				reason,
			});
		}),
	);
};
