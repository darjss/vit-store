import { initTRPC, TRPCError } from "@trpc/server";
import { middlewareMarker } from "@trpc/server/unstable-core-do-not-import";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { adminAuth } from "./session/admin";
import { auth } from "./session/store";
import { getTtlForTimeRange } from "./utils";
import type { timeRangeType } from "./zod/schema";

export const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
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

const createCacheKey = async (
	path: string,
	input: unknown,
): Promise<string> => {
	let cacheableInput: unknown = input;
	if (input && typeof input === "object") {
		const obj = input as Record<string, unknown>;
		cacheableInput = { timeRange: obj.timeRange, ttl: obj.ttl };
	}

	const keyString = `${path}:${JSON.stringify(
		cacheableInput && typeof cacheableInput === "object"
			? Object.keys(cacheableInput as Record<string, unknown>)
					.sort()
					.reduce(
						(result, key) => {
							result[key] = (cacheableInput as Record<string, unknown>)[key];
							return result;
						},
						{} as Record<string, unknown>,
					)
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
	console.log("cache middleware", cached);
	if (cached) {
		console.log("cache middleware returning cached");
		const data = JSON.parse(cached);
		return { marker: middlewareMarker, ok: true, data } as const;
	}

	const result = await next();
	console.log("cache middleware result", result);
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
