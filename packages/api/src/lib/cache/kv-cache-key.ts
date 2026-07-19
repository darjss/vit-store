export async function createKvCacheKey(
	path: string,
	input: unknown,
): Promise<string> {
	const cacheableInput =
		input && typeof input === "object"
			? {
					timeRange: (input as Record<string, unknown>).timeRange,
					ttl: (input as Record<string, unknown>).ttl,
				}
			: input;
	const normalizedInput =
		cacheableInput && typeof cacheableInput === "object"
			? Object.keys(cacheableInput)
					.sort()
					.reduce<Record<string, unknown>>((result, key) => {
						result[key] = (cacheableInput as Record<string, unknown>)[key];
						return result;
					}, {})
			: cacheableInput;
	const data = new TextEncoder().encode(
		`${path}:${JSON.stringify(normalizedInput)}`,
	);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const hashHex = Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

	return `cache:${hashHex}`;
}

export async function analyticsCacheKeys(): Promise<string[]> {
	return Promise.all([
		createKvCacheKey("analytics.getCurrentProductsValue", undefined),
		...(["daily", "weekly", "monthly"] as const).map((timeRange) =>
			createKvCacheKey("analytics.getAnalyticsData", { timeRange }),
		),
	]);
}
