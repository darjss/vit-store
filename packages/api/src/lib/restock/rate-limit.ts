import { TRPCError } from "@trpc/server";
import { redis } from "~/lib/redis";
import { checkRestockRateLimit } from "~/lib/restock/rate-limit-core";

const incrementWithExpiryScript = `
local count = redis.call("INCR", KEYS[1])
if redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

const rateLimitStore = {
	incrementWithExpiry: async (key: string, windowSeconds: number) =>
		Number(
			await redis().eval(incrementWithExpiryScript, [key], [windowSeconds]),
		),
};

export async function enforceRestockRateLimit(input: {
	action: "subscribe" | "confirmation-send" | "confirmation-attempt";
	scope: "contact" | "ip";
	value: string;
	limit: number;
	windowSeconds: number;
}) {
	const allowed = await checkRestockRateLimit({
		store: rateLimitStore,
		...input,
	});
	if (!allowed) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many restock requests",
		});
	}
}
