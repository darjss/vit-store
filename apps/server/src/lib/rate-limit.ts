import { Result, type Result as BetterResult } from "better-result";
import { match } from "dismatch";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import * as v from "valibot";

const RATE_LIMIT_CONTEXT_KEY = "rate_limit_passed";

const rateLimitFailureSchema = v.variant("_tag", [
	v.strictObject({ _tag: v.literal("InvalidRateLimitKey") }),
	v.strictObject({ _tag: v.literal("RateLimitExceeded") }),
	v.strictObject({
		_tag: v.literal("RateLimiterUnavailable"),
		retryable: v.literal(true),
	}),
]);

type RateLimitFailure = v.InferOutput<typeof rateLimitFailureSchema>;

const rateLimitResponseSchema = v.strictObject({ success: v.boolean() });

type RateLimitMiddlewareOptions = {
	rateLimiter: (c: Context) => RateLimit;
	getRateLimitKey: (c: Context) => string | undefined;
};

const checkRateLimit = async (
	limiter: RateLimit,
	key: string | undefined,
): Promise<BetterResult<void, RateLimitFailure>> => {
	if (!key) return Result.err({ _tag: "InvalidRateLimitKey" });
	let response: unknown;
	try {
		response = await limiter.limit({ key });
	} catch {
		return Result.err({
			_tag: "RateLimiterUnavailable",
			retryable: true,
		});
	}
	const parsed = v.safeParse(rateLimitResponseSchema, response);
	if (!parsed.success) {
		return Result.err({
			_tag: "RateLimiterUnavailable",
			retryable: true,
		});
	}
	return parsed.output.success
		? Result.ok(undefined)
		: Result.err({ _tag: "RateLimitExceeded" });
};

const rateLimitFailureResponse = (c: Context, error: RateLimitFailure) =>
	match(
		error,
		"_tag",
	)<Response>({
		InvalidRateLimitKey: () =>
			c.json(
				{ error: { code: "invalid_request", message: "Invalid request" } },
				400,
			),
		RateLimitExceeded: () =>
			c.json(
				{
					error: {
						code: "too_many_requests",
						message: "Too many requests",
					},
				},
				429,
			),
		RateLimiterUnavailable: () =>
			c.json(
				{
					error: {
						code: "temporarily_unavailable",
						message: "Service temporarily unavailable",
					},
				},
				503,
			),
	});

export const rateLimit = ({
	rateLimiter,
	getRateLimitKey,
}: RateLimitMiddlewareOptions) =>
	createMiddleware(async (c, next) => {
		const result = await checkRateLimit(rateLimiter(c), getRateLimitKey(c));
		if (result.status === "error") {
			c.set(RATE_LIMIT_CONTEXT_KEY, false);
			return rateLimitFailureResponse(c, result.error);
		}
		c.set(RATE_LIMIT_CONTEXT_KEY, true);
		await next();
	});
