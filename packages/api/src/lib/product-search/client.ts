import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { db } from "~/db/client";
import { loadProductSearchDocumentsFromDb } from "~/lib/product-search/db";
import type {
	ProductSearchFilters,
	ProductSearchPage,
	ProductSearchRebuildReason,
	ProductSearchSort,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";
import {
	createProductSearchEngine,
	createProductSearchRedis,
} from "~/lib/product-search/upstash";

const productSearch = () =>
	createProductSearchEngine(
		createProductSearchRedis(
			env.UPSTASH_REDIS_REST_URL,
			env.UPSTASH_REDIS_REST_TOKEN,
		),
	);

export const searchProductPage = (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}): Promise<ProductSearchPage> => productSearch().search(input);

export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
): Promise<SearchProductResult[]> => {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const result = await searchProductPage({
		query: trimmed,
		page: 1,
		pageSize: limit,
		filters,
	});
	return result.items;
};

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	const documents = await loadProductSearchDocumentsFromDb(db());
	return productSearch().replaceAll(documents, reason);
};

export const getProductSearchStatus = (): Promise<ProductSearchStatus> =>
	productSearch().getStatus();

export const clearProductSearchIndex = () => productSearch().clear();

type RebuildContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<Record<string, unknown>>;
};

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
