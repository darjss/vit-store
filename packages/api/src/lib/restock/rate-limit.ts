import { TRPCError } from "@trpc/server";
import { redis } from "~/lib/redis";

const encoder = new TextEncoder();
const incrementWithExpiryScript = `
local count = redis.call("INCR", KEYS[1])
if redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

async function hashPrivateValue(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRestockRateLimit(input: {
	action: "subscribe" | "confirmation-send" | "confirmation-attempt";
	limit: number;
	scope: "contact" | "ip";
	value: string;
	windowSeconds: number;
}) {
	const hash = await hashPrivateValue(input.value);
	const key = `restock:${input.action}:${input.scope}:${hash}`;
	const count = Number(await redis().eval(incrementWithExpiryScript, [key], [input.windowSeconds]));
	if (count > input.limit) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many restock requests",
		});
	}
}
