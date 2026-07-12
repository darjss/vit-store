import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { logger } from "~/lib/logger";
import type {
	ProductSearchFilters,
	ProductSearchPage,
	ProductSearchRebuildReason,
	ProductSearchSort,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";
import { PRODUCT_SEARCH_OBJECT_NAME } from "~/lib/product-search/types";

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

	try {
		const result = await withTimeout(
			getProductSearchService().search({
				query: trimmed,
				pageSize: limit,
				filters,
			}),
			PRODUCT_SEARCH_TIMEOUT_MS,
		);
		return result.items;
	} catch (error) {
		logger.error("product_search.search_failed", error);
		return [];
	}
};

export const searchProductPage = async (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}): Promise<ProductSearchPage> =>
	withTimeout(
		getProductSearchService().search(input),
		PRODUCT_SEARCH_TIMEOUT_MS,
	);

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	return getProductSearchService().rebuild(reason);
};

export const getProductSearchStatus =
	async (): Promise<ProductSearchStatus> => {
		return getProductSearchService().getStatus();
	};

export const clearProductSearchIndex = async () => {
	await getProductSearchService().clear();
};

type RebuildContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<any>;
};

/**
 * Schedule a product-search rebuild in the background via `waitUntil` so the
 * caller's response is not blocked. Errors are logged, never thrown.
 * Search results are never cached outside the Durable Object. The Workers
 * cache tag purge remains the canonical invalidation boundary for catalog
 * mutations; the rebuild only refreshes the index.
 */
export const scheduleProductSearchRebuild = (
	ctx: RebuildContext,
	reason: ProductSearchRebuildReason,
): void => {
	ctx.c.executionCtx.waitUntil(
		rebuildProductSearchIndex(reason).catch((error) => {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "product_search.rebuild_failed",
				reason,
			});
		}),
	);
};
