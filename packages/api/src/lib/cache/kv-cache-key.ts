import type { timeRangeType } from "@vit/shared/schema";
import { getTimeRangeBounds } from "~/lib/utils";

// Analytics cache namespace. Version bumps invalidate every previously cached
// analytics entry; the business timezone is pinned so a key never silently
// shifts meaning if the store's operating timezone changes.
const ANALYTICS_CACHE_VERSION = "v1";
const ANALYTICS_TIMEZONE = "asia/ulaanbaatar";

const ANALYTICS_TIME_RANGE_PROCEDURES = [
	"analytics.getAverageOrderValue",
	"analytics.getTotalProfit",
	"analytics.getSalesByCategory",
	"analytics.getRepeatCustomersCount",
	"analytics.getFailedPayments",
	"analytics.getTopBrandsBySales",
	"analytics.getCurrentProductsValue",
	"analytics.getAnalyticsData",
] as const;

const ANALYTICS_NO_INPUT_PROCEDURES = [
	"analytics.getCustomerLifetimeValue",
] as const;

async function sha256(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/**
 * Exact UB-aligned bounds for an analytics time-range input, or null when the
 * input is not a time-range analytics query. The bounds pin the START and END
 * instants the cache entry covers (Asia/Ulaanbaatar midnight boundaries), so a
 * "daily" entry is stable for the whole UB day and rolls over at UB midnight.
 */
function analyticsRangeBounds(
	input: unknown,
): { startIso: string; endIso: string } | null {
	if (!input || typeof input !== "object" || !("timeRange" in input)) {
		return null;
	}
	const timeRange = (input as Record<string, unknown>).timeRange;
	if (
		timeRange !== "daily" &&
		timeRange !== "weekly" &&
		timeRange !== "monthly"
	) {
		return null;
	}
	const { start, end } = getTimeRangeBounds(timeRange as timeRangeType);
	return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function createKvCacheKey(
	path: string,
	input: unknown,
): Promise<string> {
	const range = analyticsRangeBounds(input);
	if (range) {
		const raw = [
			"analytics",
			ANALYTICS_CACHE_VERSION,
			ANALYTICS_TIMEZONE,
			path,
			range.startIso,
			range.endIso,
		].join(":");
		return `cache:${await sha256(raw)}`;
	}

	const normalizedInput =
		input && typeof input === "object"
			? Object.keys(input)
					.sort()
					.reduce<Record<string, unknown>>((result, key) => {
						result[key] = (input as Record<string, unknown>)[key];
						return result;
					}, {})
			: input;
	// Generic cached-procedure key. The "v1" marker invalidates entries cached
	// by earlier key schemes.
	const raw = `v1:${path}:${JSON.stringify(normalizedInput)}`;
	return `cache:${await sha256(raw)}`;
}

/**
 * Every live analytics cache key for the current UB day. Call after product,
 * inventory, order, or payment writes so the next analytics read recomputes
 * from the database instead of serving a stale snapshot.
 */
export async function analyticsCacheKeys(): Promise<string[]> {
	const keys: string[] = [];
	for (const path of ANALYTICS_NO_INPUT_PROCEDURES) {
		keys.push(await createKvCacheKey(path, undefined));
	}
	for (const timeRange of ["daily", "weekly", "monthly"] as const) {
		for (const path of ANALYTICS_TIME_RANGE_PROCEDURES) {
			keys.push(await createKvCacheKey(path, { timeRange }));
		}
	}
	return keys;
}

/** Delete today's analytics cache entries from the admin KV namespace. */
export async function purgeAnalyticsCache(ctx: {
	kv: KVNamespace;
}): Promise<void> {
	const keys = await analyticsCacheKeys();
	if (keys.length === 0) return;
	await Promise.allSettled(keys.map((key) => ctx.kv.delete(key)));
}
