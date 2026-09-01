import { initTRPC, TRPCError } from "@trpc/server";
import { sanitizePublicTrpcErrorShape, type timeRangeType } from "@vit/shared";
import superjson from "superjson";
import * as v from "valibot";
import { createKvCacheKey } from "~/lib/cache/kv-cache-key";
import type { Context } from "~/lib/context";
import { summarizeTrpcInputForLog, summarizeTrpcOutputForLog, toError } from "~/lib/logging";
import { adminAuth } from "~/lib/session/admin";
import { isPhoneVerifiedCustomer } from "~/lib/session/checkout-access";
import { auth } from "~/lib/session/store";
import { getTtlForTimeRange } from "~/lib/utils";

const isLocalDevelopment = process.env.NODE_ENV === "development";

const t = initTRPC.context<Context>().create({
	errorFormatter({ error, shape }) {
		if (isLocalDevelopment) {
			return {
				...shape,
				data: {
					...shape.data,
					valibotError: error.cause instanceof v.ValiError ? error.cause.issues : null,
				},
			};
		}

		const publicShape = sanitizePublicTrpcErrorShape(shape, shape.data.httpStatus);
		return {
			...publicShape,
			data: { ...publicShape.data, valibotError: null },
		};
	},
	isDev: isLocalDevelopment,
	transformer: superjson,
});

export const router = t.router;

const customerAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await auth(ctx);
	if (!session) {
		ctx.log.warn("auth.login_failed", { failure_reason: "no_session" });
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}

	ctx.log.set({
		user: { id: session.user.id, phone: session.user.phone },
		user_type: "customer",
	});
	return next({ ctx: { ...ctx, session } });
});

const verifiedCustomerAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await auth(ctx);
	if (!session) {
		ctx.log.warn("auth.login_failed", { failure_reason: "no_session" });
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}

	const nextCtx = { ...ctx, session };
	if (!isPhoneVerifiedCustomer(nextCtx)) {
		ctx.log.warn("auth.login_failed", {
			failure_reason: "phone_not_verified",
		});
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Phone verification required",
		});
	}

	ctx.log.set({
		user: { id: session.user.id },
		user_type: "customer",
	});
	return next({ ctx: nextCtx });
});

const adminAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await adminAuth(ctx);
	if (!session) {
		ctx.log.warn("auth.login_failed", {
			failure_reason: "no_admin_session",
		});
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}

	ctx.log.set({
		user: { email: session.user.username, id: session.user.id },
		user_type: "admin",
	});
	return next({ ctx: { ...ctx, session } });
});

function ensureTRPCError(
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
			cause: error,
			code: "INTERNAL_SERVER_ERROR",
			message: error.message || fallbackMessage,
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
		cause: error,
		code: "INTERNAL_SERVER_ERROR",
		message: fallbackMessage,
	});
}

const errorHandlingMiddleware = t.middleware(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		throw ensureTRPCError(error);
	}
});

const loggingMiddleware = t.middleware(async ({ ctx, input, next, path, type }) => {
	const startTime = Date.now();
	const procedureType = (type as string | undefined)?.toUpperCase() || "PROCEDURE";
	const safeInput = summarizeTrpcInputForLog(path, input);

	ctx.log.set({
		trpc: {
			input: safeInput,
			procedure: path,
			type: procedureType,
		},
	});

	try {
		const result = await next();
		const durationMs = Date.now() - startTime;
		const resultData =
			result && typeof result === "object" && "data" in result
				? (result as { data?: unknown }).data
				: result;
		const safeOutput = summarizeTrpcOutputForLog(path, resultData);

		ctx.log.set({
			trpc: {
				duration_ms: durationMs,
				outcome: "success",
				output: safeOutput,
				procedure: path,
				type: procedureType,
			},
		});

		return result;
	} catch (error) {
		const durationMs = Date.now() - startTime;

		ctx.log.error(toError(error), {
			event: "trpc.procedure_error",
			trpc: {
				duration_ms: durationMs,
				error_code: error instanceof TRPCError ? error.code : undefined,
				input: safeInput,
				outcome: "error",
				procedure: path,
				type: procedureType,
			},
		});

		throw error;
	}
});

const cacheMiddleware = t.middleware(async ({ ctx, input, next, path }) => {
	const cacheKey = await createKvCacheKey(path, input);

	const cached = await ctx.kv.get(cacheKey);
	if (cached) {
		ctx.log.info("cache.hit", { cache_key: cacheKey, path });
		// Return in the same format as next() returns
		// Using type assertion because the middleware marker type is branded and can't be created directly
		return {
			data: JSON.parse(cached),
			marker: "middlewareMarker" as "middlewareMarker" & {
				__brand: "middlewareMarker";
			},
			ok: true as const,
		};
	}

	ctx.log.info("cache.miss", { cache_key: cacheKey, path });

	const result = await next();
	if (result && typeof result === "object" && "data" in result) {
		let ttl: number;

		if (input && typeof input === "object" && "timeRange" in input) {
			ttl = getTtlForTimeRange((input as Record<string, unknown>).timeRange as timeRangeType);
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

		ctx.log.info("cache.set", { cache_key: cacheKey, cache_ttl: ttl, path });
	}

	return result;
});

// Shared base: error handling + request logging. Every authenticated
// procedure composes from this so the cross-cutting middlewares are applied
// once and in a consistent order.
export const baseProcedure = t.procedure.use(errorHandlingMiddleware).use(loggingMiddleware);

export const publicProcedure = baseProcedure;
export const customerProcedure = baseProcedure.use(customerAuthMiddleware);
export const verifiedCustomerProcedure = baseProcedure.use(verifiedCustomerAuthMiddleware);
export const adminProcedure = baseProcedure.use(adminAuthMiddleware);

// Bot auth: a shared-secret header (`X-Admin-Bot-Token`) gates machine-to-
// machine access from the admin Messenger agent Worker to the store API. No
// admin session — the token IS the credential. Used by the bot router so the
// agent can read admin data (e.g. pending orders) without a browser session.
// Token comparison is constant-time (SHA-256 both sides, compare digests) to
// prevent timing side-channel attacks on the shared secret.
export const timingSafeEqual = async (a: string, b: string): Promise<boolean> => {
	const encoder = new TextEncoder();
	const [hashA, hashB] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(a)),
		crypto.subtle.digest("SHA-256", encoder.encode(b)),
	]);
	const arrA = new Uint8Array(hashA);
	const arrB = new Uint8Array(hashB);
	let diff = 0;
	for (let i = 0; i < arrA.length; i++) {
		diff |= arrA[i] ^ arrB[i];
	}
	return diff === 0;
};

const botAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const token = ctx.c.env.ADMIN_BOT_TOKEN;
	const provided = ctx.c.req.header("X-Admin-Bot-Token");
	if (!token || !provided || !(await timingSafeEqual(token, provided))) {
		ctx.log.warn("auth.login_failed", { failure_reason: "bad_bot_token" });
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	ctx.log.set({ user_type: "bot" });
	return next();
});
export const botProcedure = baseProcedure.use(botAuthMiddleware);

export const cachedProcedure = baseProcedure.use(cacheMiddleware);
export const customerCachedProcedure = customerProcedure.use(cacheMiddleware);
export const adminCachedProcedure = adminProcedure.use(cacheMiddleware);
export const botCachedProcedure = botProcedure.use(cacheMiddleware);
