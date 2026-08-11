/*
 * Analytics — central cache helpers, keyed by timeRange.
 *
 * Analytics has no writes of its own (read-only screens), but product/order
 * writes purge the server KV cache (contract §4) — these helpers let callers
 * refetch the affected range-scoped client queries so the screen agrees.
 * Range changes never need invalidation: each timeRange is its own query key.
 */
import type { QueryClient } from "@tanstack/solid-query";
import type { AnalyticsRange } from "./queries";
import { analyticsKeys } from "./queries";

/** Refetch the range-scoped analytics queries after an upstream write. */
export function invalidateAnalyticsForRange(
	queryClient: QueryClient,
	timeRange: AnalyticsRange,
): Promise<unknown> {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: analyticsKeys.snapshot(timeRange),
		}),
		queryClient.invalidateQueries({
			queryKey: analyticsKeys.visitorTrend(timeRange),
		}),
	]);
}

/** Refetch every analytics surface (all ranges + the fresh low-stock list). */
export function invalidateAllAnalytics(
	queryClient: QueryClient,
): Promise<unknown> {
	return queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}
