export type RestockRateLimitStore = {
	incr: (key: string) => Promise<number>;
	expire: (key: string, windowSeconds: number) => Promise<unknown>;
};

const encoder = new TextEncoder();

async function hashPrivateValue(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function checkRestockRateLimit(input: {
	store: RestockRateLimitStore;
	action: "subscribe" | "confirmation-send" | "confirmation-attempt";
	scope: "contact" | "ip";
	value: string;
	limit: number;
	windowSeconds: number;
}) {
	const hash = await hashPrivateValue(input.value);
	const key = `restock:${input.action}:${input.scope}:${hash}`;
	const count = await input.store.incr(key);
	if (count === 1) await input.store.expire(key, input.windowSeconds);
	return count <= input.limit;
}
