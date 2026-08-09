import { TRPCError } from "@trpc/server";
import { redis } from "~/lib/redis";
import { checkRestockRateLimit } from "~/lib/restock/rate-limit-core";

export async function enforceRestockRateLimit(input: {
	action: "subscribe" | "confirmation-send" | "confirmation-attempt";
	scope: "contact" | "ip";
	value: string;
	limit: number;
	windowSeconds: number;
}) {
	const allowed = await checkRestockRateLimit({ store: redis(), ...input });
	if (!allowed) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many restock requests",
		});
	}
}
