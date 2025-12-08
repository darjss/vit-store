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

const loggingMiddleware = t.middleware(
	async ({ ctx, next, path, type, input }) => {
		const startTime = Date.now();
		const timestamp = new Date().toISOString();
		const procedureType =
			(type as string | undefined)?.toUpperCase() || "PROCEDURE";

		// Log request
		console.log(`\n${"=".repeat(80)}`);
		console.log(`🔵 [${timestamp}] tRPC ${procedureType}: ${path}`);
		console.log("─".repeat(80));
		console.log("📥 INPUT:");
		console.log(JSON.stringify(input, null, 2));
		console.log("─".repeat(80));

		try {
			const result = await next();
			const duration = Date.now() - startTime;

			// Log success response
			console.log("📤 OUTPUT:");
			if (result && typeof result === "object" && "data" in result) {
				// For large outputs, truncate if needed
				const outputStr = JSON.stringify(result.data, null, 2);
				if (outputStr.length > 2000) {
					console.log(`${outputStr.substring(0, 2000)}\n... (truncated)`);
				} else {
					console.log(outputStr);
				}
			} else {
				console.log(JSON.stringify(result, null, 2));
			}
			console.log("─".repeat(80));
			console.log(`✅ SUCCESS (${duration}ms)`);
			console.log(`${"=".repeat(80)}\n`);

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;

			// Log error response
			console.log("❌ ERROR:");
			if (error instanceof TRPCError) {
				console.log(`   Code: ${error.code}`);
				console.log(`   Message: ${error.message}`);
				if (error.cause) {
					console.log("cause:", error.cause);
				}
			} else if (error instanceof Error) {
				console.log(`   Name: ${error.name}`);
				console.log(`   Message: ${error.message}`);
				if (error.stack) {
					console.log(`   Stack: ${error.stack}`);
				}
			} else {
				console.log(JSON.stringify(error, null, 2));
			}
			console.log("─".repeat(80));
			console.log(`❌ FAILED (${duration}ms)`);
			console.log(`${"=".repeat(80)}\n`);

			throw error;
		}
	},
);

const cacheMiddleware = t.middleware(async ({ ctx, next, path, input }) => {
	const cacheKey = await createCacheKey(path, input);
	console.log("cache middleware", cacheKey);

	const cached = await ctx.kv.get(cacheKey);
	console.log("path", path, "input", input, "cache middleware", cached);
	if (cached) {
		console.log("cache middleware returning cached");
		// Return in the same format as next() returns
		// Using type assertion because the middleware marker type is branded and can't be created directly
		return {
			ok: true as const,
			data: JSON.parse(cached),
			marker: "middlewareMarker" as any,
		};
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

export const publicProcedure = t.procedure.use(loggingMiddleware);
export const customerProcedure = t.procedure
	.use(loggingMiddleware)
	.use(customerAuthMiddleware);
export const adminProcedure = t.procedure
	.use(loggingMiddleware)
	.use(adminAuthMiddleware);

export const cachedProcedure = t.procedure
.use(loggingMiddleware)
	.use(cacheMiddleware);
export const customerCachedProcedure = customerProcedure.use(cacheMiddleware);
export const adminCachedProcedure = adminProcedure.use(cacheMiddleware);
