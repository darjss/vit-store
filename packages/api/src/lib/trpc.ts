import { initTRPC, TRPCError } from "@trpc/server";
import type { timeRangeType } from "@vit/shared";
import superjson from "superjson";
import * as v from "valibot";
import type { Context } from "./context";
import { adminAuth } from "./session/admin";
import { auth } from "./session/store";
import { getTtlForTimeRange } from "./utils";

export const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				valibotError:
					error.cause instanceof v.ValiError ? error.cause.issues : null,
			},
		};
	},
});

export const router = t.router;

const customerAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await auth(ctx);
	if (!session) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	return next({ ctx: { ...ctx, session } });
});
const adminAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await adminAuth(ctx);
	if (!session) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	return next({ ctx: { ...ctx, session } });
});

const createCacheKey = async (path: string, input: any): Promise<string> => {
	const cacheableInput =
		input && typeof input === "object"
			? { timeRange: input.timeRange, ttl: input.ttl }
			: input;

	const keyString = `${path}:${JSON.stringify(
		cacheableInput && typeof cacheableInput === "object"
			? Object.keys(cacheableInput)
					.sort()
					.reduce((result, key) => {
						result[key] = cacheableInput[key];
						return result;
					}, {} as any)
			: cacheableInput,
	)}`;

	const encoder = new TextEncoder();
	const data = encoder.encode(keyString);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	return `cache:${hashHex}`;
};

const cacheMiddleware = t.middleware(async ({ ctx, next, path, input }) => {
	const cacheKey = await createCacheKey(path, input);
	console.log("cache middleware", cacheKey);

	const cached = await ctx.kv.get(cacheKey);
	console.log("path", path, "input", input, "cache middleware", cached);
	if (cached) {
		console.log("cache middleware returning cached");
		return JSON.parse(cached);
	}

	const result = await next();
	console.log("path", path, "input", input, "cache middleware result", result);
	if (result && typeof result === "object" && "data" in result) {
		let ttl: number;

		if (input && typeof input === "object" && "timeRange" in input) {
			ttl = getTtlForTimeRange(input.timeRange as timeRangeType);
		} else if (
			input &&
			typeof input === "object" &&
			"ttl" in input &&
			typeof input.ttl === "number"
		) {
			ttl = input.ttl;
		} else {
			ttl = 3000;
		}
		console.log("cache middleware", ttl);
		await ctx.kv.put(cacheKey, JSON.stringify(result.data), {
			expirationTtl: ttl,
		});
	}

	return result;
});

export const publicProcedure = t.procedure;
export const customerProcedure = t.procedure.use(customerAuthMiddleware);
export const adminProcedure = t.procedure.use(adminAuthMiddleware);

export const cachedProcedure = t.procedure.use(cacheMiddleware);
export const customerCachedProcedure = customerProcedure.use(cacheMiddleware);
export const adminCachedProcedure = adminProcedure.use(cacheMiddleware);
