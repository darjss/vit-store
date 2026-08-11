/*
 * Analytics — query modules (TanStack Solid Query).
 *
 * Conventions (plans/admin-v1-solid-rewrite.md + store-kit):
 * - hierarchical query keys under ["analytics", ...]
 * - components call query options; they never define request functions
 * - the typed tRPC client (`api` from @/lib/trpc) is the only transport
 *
 * Cache rules (plans/admin-v2-contracts.md §4):
 * - getAnalyticsData is the combined KV-cached snapshot; the client keeps the
 *   shell default staleness and never caches long. Every key carries the
 *   timeRange so a range change refetches (the server cache key already pins
 *   the UB-aligned window + timezone + schema version).
 * - getLowInventoryProducts is NOT cached server-side — a fresh inventory
 *   surface — so keep the client view short-lived too.
 * - getDailyVisitorTrend is PostHog-backed and THROWS on failure (no
 *   fabricated fallback). The UI renders an explicit unavailable state for
 *   it, never zero-filled fiction.
 */
import { queryOptions } from "@tanstack/solid-query";

import { api } from "@/lib/trpc";

/**
 * Exact input/output shapes straight from @vit/api (the typed client). These
 * stay in sync with the router automatically — never hand-write a mirror.
 */
export type AnalyticsSnapshotInput = Parameters<
	typeof api.analytics.getAnalyticsData.query
>[0];
export type AnalyticsRange = AnalyticsSnapshotInput["timeRange"];
export type AnalyticsSnapshotData = Awaited<
	ReturnType<typeof api.analytics.getAnalyticsData.query>
>;
export type VisitorTrendData = Awaited<
	ReturnType<typeof api.analytics.getDailyVisitorTrend.query>
>;
export type VisitorTrendPoint = VisitorTrendData[number];
export type LowInventoryItem = Awaited<
	ReturnType<typeof api.analytics.getLowInventoryProducts.query>
>[number];

const analyticsRoot = ["analytics"] as const;

export const analyticsKeys = {
	all: analyticsRoot,
	snapshot: (timeRange: AnalyticsRange) =>
		[...analyticsRoot, "snapshot", timeRange] as const,
	visitorTrend: (timeRange: AnalyticsRange) =>
		[...analyticsRoot, "visitor-trend", timeRange] as const,
	lowInventory: [...analyticsRoot, "low-inventory"] as const,
} as const;

/** Combined KV-cached analytics snapshot for one range (contract §4). */
export const analyticsSnapshotQueryOptions = (timeRange: AnalyticsRange) =>
	queryOptions({
		queryKey: analyticsKeys.snapshot(timeRange),
		queryFn: () => api.analytics.getAnalyticsData.query({ timeRange }),
	});

/**
 * PostHog-backed daily visitor trend. The procedure throws on PostHog
 * failure — the trend section must show an unavailable state, never zeros.
 */
export const visitorTrendQueryOptions = (timeRange: AnalyticsRange) =>
	queryOptions({
		queryKey: analyticsKeys.visitorTrend(timeRange),
		queryFn: () => api.analytics.getDailyVisitorTrend.query({ timeRange }),
	});

/** Low-stock products — never cached server-side, stays fresh (contract §4). */
export const lowInventoryQueryOptions = () =>
	queryOptions({
		queryKey: analyticsKeys.lowInventory,
		queryFn: () => api.analytics.getLowInventoryProducts.query(),
	});
