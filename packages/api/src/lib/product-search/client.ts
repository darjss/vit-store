import { env } from "cloudflare:workers";
import type { RequestLogger } from "evlog";
import { db } from "~/db/client";
import { createPostHogClient } from "~/lib/integrations/posthog";
import { loadProductSearchDocumentsFromDb } from "~/lib/product-search/db";
import type {
	ProductSearchAnalyticsSignal,
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
	withProductSearchRebuildLock,
} from "~/lib/product-search/upstash";

const RANKING_SIGNALS_KEY = "search:vit:v3:ranking-signals";
const RANKING_SIGNALS_FRESH_MS = 6 * 60 * 60 * 1000;

type RankingSignalsCache = {
	fetchedAt: string;
	signals: Array<ProductSearchAnalyticsSignal>;
};

const loadRankingSignals = async (redis: ReturnType<typeof createProductSearchRedis>) => {
	const cached = await redis.get<RankingSignalsCache>(RANKING_SIGNALS_KEY);
	if (cached && Date.now() - Date.parse(cached.fetchedAt) < RANKING_SIGNALS_FRESH_MS) {
		return cached.signals;
	}

	try {
		const signals = await createPostHogClient(env).getProductSearchRankingSignals(90);
		await redis.set(
			RANKING_SIGNALS_KEY,
			JSON.stringify({ fetchedAt: new Date().toISOString(), signals }),
		);
		return signals;
	} catch (error) {
		if (cached) {
			return cached.signals;
		}
		throw error;
	}
};

const productSearch = () =>
	createProductSearchEngine(
		createProductSearchRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
	);

export const searchProductPage = (input: {
	filters?: ProductSearchFilters;
	page: number;
	pageSize: number;
	query: string;
	sort?: ProductSearchSort;
}): Promise<ProductSearchPage> => productSearch().search(input);

export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
): Promise<Array<SearchProductResult>> => {
	const trimmed = query.trim();
	if (!trimmed) {
		return [];
	}
	const result = await searchProductPage({
		filters,
		page: 1,
		pageSize: limit,
		query: trimmed,
	});
	return result.items;
};

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> => {
	const redis = createProductSearchRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
	const signals = await loadRankingSignals(redis);
	return withProductSearchRebuildLock(redis, async () => {
		const documents = await loadProductSearchDocumentsFromDb(db(), signals);
		return createProductSearchEngine(redis).replaceAll(documents, reason);
	});
};

export const getProductSearchStatus = (): Promise<ProductSearchStatus> =>
	productSearch().getStatus();

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
