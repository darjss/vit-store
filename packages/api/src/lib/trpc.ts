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
		ctx.log.auth.loginFailed({ failureReason: "no_session" });
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}

	const enrichedLog = ctx.log.child({
		userId: session.user.id,
		userPhone: session.user.phone,
		userType: "customer",
	});
	return next({ ctx: { ...ctx, session, log: enrichedLog } });
});

const adminAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await adminAuth(ctx);
	if (!session) {
		ctx.log.auth.loginFailed({ failureReason: "no_admin_session" });
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}

	const enrichedLog = ctx.log.child({
		userId: session.user.id,
		userEmail: session.user.username,
		userType: "admin",
	});
	return next({ ctx: { ...ctx, session, log: enrichedLog } });
});

const createCacheKey = async (
	path: string,
	input: unknown,
): Promise<string> => {
	const cacheableInput =
		input && typeof input === "object"
			? {
					timeRange: (input as Record<string, unknown>).timeRange,
					ttl: (input as Record<string, unknown>).ttl,
				}
			: input;

	const keyString = `${path}:${JSON.stringify(
		cacheableInput && typeof cacheableInput === "object"
			? Object.keys(cacheableInput)
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

export function ensureTRPCError(
	error: unknown,
	fallbackMessage = "An unexpected error occurred",
): TRPCError {
	// Already a TRPCError - return as-is
	if (error instanceof TRPCError) {
		return error;
	}

	// Regular Error - wrap it
	if (error instanceof Error) {
		return new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error.message || fallbackMessage,
			cause: error,
		});
	}

	// String error
	if (typeof error === "string") {
		return new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error || fallbackMessage,
		});
	}

	// Unknown error type - use fallback
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: fallbackMessage,
		cause: error,
	});
}

const errorHandlingMiddleware = t.middleware(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		throw ensureTRPCError(error);
	}
});

const loggingMiddleware = t.middleware(
	async ({ ctx, next, path, type, input }) => {
		const startTime = Date.now();
		const procedureType =
			(type as string | undefined)?.toUpperCase() || "PROCEDURE";

		// Log procedure start with input
		ctx.log.info("trpc.procedure_start", {
			procedure: path,
			type: procedureType,
			input,
		});

		try {
			const result = await next();
			const durationMs = Date.now() - startTime;

			// Log procedure success with output
			ctx.log.info("trpc.procedure_success", {
				procedure: path,
				type: procedureType,
				durationMs,
				output: result,
			});

			return result;
		} catch (error) {
			const durationMs = Date.now() - startTime;

			// Log procedure error with input for debugging
			ctx.log.error("trpc.procedure_error", error, {
				procedure: path,
				type: procedureType,
				durationMs,
				input,
				errorCode: error instanceof TRPCError ? error.code : undefined,
			});

			throw error;
		}
	},
);

const cacheMiddleware = t.middleware(async ({ ctx, next, path, input }) => {
	const cacheKey = await createCacheKey(path, input);

	const cached = await ctx.kv.get(cacheKey);
	if (cached) {
		ctx.log.system.cacheHit({ cacheKey, path });
		// Return in the same format as next() returns
		// Using type assertion because the middleware marker type is branded and can't be created directly
		return {
			ok: true as const,
			data: JSON.parse(cached),
			marker: "middlewareMarker" as "middlewareMarker" & {
				__brand: "middlewareMarker";
			},
		};
	}

	ctx.log.system.cacheMiss({ cacheKey, path });

	const result = await next();
	if (result && typeof result === "object" && "data" in result) {
		let ttl: number;

		if (input && typeof input === "object" && "timeRange" in input) {
			ttl = getTtlForTimeRange(
				(input as Record<string, unknown>).timeRange as timeRangeType,
			);
		} else if (
			input &&
			typeof input === "object" &&
			"ttl" in input &&
			typeof (input as Record<string, unknown>).ttl === "number"
		) {
			ttl = (input as Record<string, unknown>).ttl as number;
		} else {
			ttl = 3000;
		}

		await ctx.kv.put(cacheKey, JSON.stringify(result.data), {
			expirationTtl: ttl,
		});

		ctx.log.system.cacheSet({ cacheKey, path, cacheTtl: ttl });
	}

	return result;
});

export const publicProcedure = t.procedure
	.use(errorHandlingMiddleware)
	.use(loggingMiddleware);
export const customerProcedure = t.procedure
	.use(errorHandlingMiddleware)
	.use(loggingMiddleware)
	.use(customerAuthMiddleware);
export const adminProcedure = t.procedure
	.use(errorHandlingMiddleware)
	.use(loggingMiddleware)
	.use(adminAuthMiddleware);

export const cachedProcedure = t.procedure
	.use(errorHandlingMiddleware)
	.use(loggingMiddleware)
	.use(cacheMiddleware);
export const customerCachedProcedure = customerProcedure.use(cacheMiddleware);
export const adminCachedProcedure = adminProcedure.use(cacheMiddleware);
