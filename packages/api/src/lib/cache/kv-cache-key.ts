import {
	type CacheProcedureInput,
	normalizeCacheKvInput,
	parseCacheKvInput,
} from "~/lib/cache/cache-input";
import type { LogWire } from "~/lib/logging";

function sortedCacheFields(
	input: CacheProcedureInput | null | undefined,
): CacheProcedureInput | null | undefined {
	if (input === null || input === undefined) {
		return input;
	}
	const normalized: CacheProcedureInput = {};
	if (input.timeRange !== undefined) {
		normalized.timeRange = input.timeRange;
	}
	if (input.ttl !== undefined) {
		normalized.ttl = input.ttl;
	}
	return normalized;
}

export async function createKvCacheKey(path: string, input: LogWire): Promise<string> {
	const normalizedInput = sortedCacheFields(normalizeCacheKvInput(parseCacheKvInput(input)));
	const data = new TextEncoder().encode(`${path}:${JSON.stringify(normalizedInput)}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const hashHex = Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

	return `cache:${hashHex}`;
}

export async function analyticsCacheKeys(): Promise<Array<string>> {
	return Promise.all([
		createKvCacheKey("analytics.getCurrentProductsValue", undefined),
		...(["daily", "weekly", "monthly"] as const).map((timeRange) =>
			createKvCacheKey("analytics.getAnalyticsData", { timeRange }),
		),
	]);
}
