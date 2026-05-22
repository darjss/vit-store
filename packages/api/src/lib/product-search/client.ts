import { env } from "cloudflare:workers";
import { logger } from "~/lib/logger";
import type {
	ProductSearchFilters,
	ProductSearchRebuildReason,
	ProductSearchService,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";
import { PRODUCT_SEARCH_OBJECT_NAME } from "~/lib/product-search/types";

const getProductSearchService = () =>
	(
		env as unknown as {
			PRODUCT_SEARCH: { getByName(name: string): ProductSearchService };
		}
	).PRODUCT_SEARCH.getByName(PRODUCT_SEARCH_OBJECT_NAME);

export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
): Promise<SearchProductResult[]> => {
	try {
		return await getProductSearchService().search({ query, limit, filters });
	} catch (error) {
		logger.error("product_search.search_failed", error);
		return [];
	}
};

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	return getProductSearchService().rebuild(reason);
};

export const getProductSearchStatus = async (): Promise<ProductSearchStatus> => {
	return getProductSearchService().getStatus();
};

export const clearProductSearchIndex = async () => {
	await getProductSearchService().clear();
};

/** Product writes trigger a full MiniSearch rebuild rather than incremental upsert. */
export const scheduleProductSearchRebuild = async (
	reason: ProductSearchRebuildReason = "product_updated",
) => {
	try {
		await rebuildProductSearchIndex(reason);
	} catch (error) {
		logger.error("product_search.rebuild_schedule_failed", error, { reason });
	}
};

/** @deprecated Use scheduleProductSearchRebuild */
export const upsertProductToSearch = scheduleProductSearchRebuild;

/** @deprecated Use scheduleProductSearchRebuild */
export const deleteProductFromSearch = async (_productId: number) => {
	await scheduleProductSearchRebuild("product_deleted");
};
