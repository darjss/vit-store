import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { logger } from "~/lib/logger";
import {
	clearUpstashProductSearchIndex,
	getUpstashProductSearchStatus,
	isUpstashRedisSearchConfigured,
	rebuildUpstashProductSearchIndex,
	searchUpstashProductPage,
} from "~/lib/product-search/upstash-redis";
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
			),
		),
	]);

const searchDurableObject = (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}) =>
	withTimeout(
		getProductSearchService().search(input),
		PRODUCT_SEARCH_TIMEOUT_MS,
	);

export const searchProductPage = async (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}): Promise<ProductSearchPage> => {
	if (isUpstashRedisSearchConfigured()) {
		try {
			return await withTimeout(
				searchUpstashProductPage(input),
				PRODUCT_SEARCH_TIMEOUT_MS,
			);
		} catch (error) {
			logger.error("product_search.upstash_search_failed", error);
		}
	}

	return searchDurableObject(input);
};

export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
): Promise<SearchProductResult[]> => {
	const trimmed = query.trim();
	if (!trimmed) return [];

	try {
		const result = await searchProductPage({
			query: trimmed,
			page: 1,
			pageSize: limit,
			filters,
		});
		return result.items;
	} catch (error) {
		logger.error("product_search.search_failed", error);
		return [];
	}
};

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	const durableRebuild = getProductSearchService().rebuild(reason);
	if (!isUpstashRedisSearchConfigured()) return durableRebuild;

	const [upstashResult, durableResult] = await Promise.allSettled([
		rebuildUpstashProductSearchIndex(reason),
		durableRebuild,
	]);

	if (upstashResult.status === "fulfilled") {
		if (durableResult.status === "rejected") {
			logger.error(
				"product_search.durable_object_rebuild_failed",
				durableResult.reason,
			);
		}
		return upstashResult.value;
	}

	logger.error("product_search.upstash_rebuild_failed", upstashResult.reason);
	if (durableResult.status === "fulfilled") return durableResult.value;
	throw upstashResult.reason;
};

export const getProductSearchStatus = async (): Promise<ProductSearchStatus> => {
	if (isUpstashRedisSearchConfigured()) {
		try {
			const status = await getUpstashProductSearchStatus();
			if (status.initialized || status.lastError) return status;
		} catch (error) {
			logger.error("product_search.upstash_status_failed", error);
		}
	}
	return getProductSearchService().getStatus();
};

export const clearProductSearchIndex = async () => {
	const tasks: Promise<unknown>[] = [getProductSearchService().clear()];
	if (isUpstashRedisSearchConfigured()) {
		tasks.push(clearUpstashProductSearchIndex());
	}
	const results = await Promise.allSettled(tasks);
	if (results.every((result) => result.status === "rejected")) {
		throw (results[0] as PromiseRejectedResult).reason;
	}
};

type RebuildContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<any>;
};

/**
 * Schedule a product-search rebuild via `waitUntil` so catalog mutations do
 * not block on index maintenance. While the migration is in shadow-safe mode,
 * a rebuild refreshes Upstash Redis Search and the Durable Object fallback.
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
