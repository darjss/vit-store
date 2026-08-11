/*
 * Home — query module (TanStack Solid Query).
 *
 * Conventions (plans/admin-v1-solid-rewrite.md + store-kit):
 * - hierarchical query keys under ["home", ...]
 * - components call query options; they never define request functions
 * - the typed tRPC client (`api` from @/lib/trpc) is the only transport
 *
 * Contract (plans/admin-v2-contracts.md §4): the whole home payload arrives
 * in ONE call — analytics.getHomePageData(timeRange). pendingOrders /
 * lowStockProducts / recentOrders are never served from Workers Cache (fresh
 * work queue); revenue / orderCount / topProducts may come from the analytics
 * KV cache. On the client the query refetches every 15s while mounted (the
 * same interval the orders list uses) so the queue stays current. Do not lift
 * the pending/low-stock surfaces onto any long client cache.
 */
import { queryOptions } from "@tanstack/solid-query";

import { api } from "@/lib/trpc";

/**
 * Exact input/output shapes straight from @vit/api (the typed client). These
 * stay in sync with the router automatically — never hand-write a mirror.
 */
export type HomePageInput = Parameters<
	typeof api.analytics.getHomePageData.query
>[0];
export type HomePageData = Awaited<
	ReturnType<typeof api.analytics.getHomePageData.query>
>;
export type HomePendingOrder = HomePageData["pendingOrders"][number];
export type HomeRecentOrder = HomePageData["recentOrders"][number];
export type HomeLowStockProduct = HomePageData["lowStockProducts"][number];
export type HomeTopProduct = HomePageData["topProducts"][number];

/**
 * The range the home payload requests. Only revenue and orderCount depend on
 * it (topProducts is fixed to the last 30 days server-side). Weekly matches
 * the approved prototype's 7-day emphasis.
 */
export const HOME_TIME_RANGE = "weekly" as const;

const homeRoot = ["home"] as const;

export const homeKeys = {
	all: homeRoot,
	page: (timeRange: HomePageInput["timeRange"]) =>
		[...homeRoot, "page", timeRange] as const,
} as const;

export const homePageQueryOptions = (timeRange: HomePageInput["timeRange"]) =>
	queryOptions({
		queryKey: homeKeys.page(timeRange),
		queryFn: () => api.analytics.getHomePageData.query({ timeRange }),
		refetchInterval: 15_000,
	});
