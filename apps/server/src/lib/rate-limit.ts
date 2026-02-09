import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

const RATE_LIMIT_CONTEXT_KEY = "rate_limit_passed";

type RateLimitMiddlewareOptions = {
	rateLimiter: (c: Context) => RateLimit;
	getRateLimitKey: (c: Context) => string;
};

export const rateLimit = ({
	rateLimiter,
	getRateLimitKey,
}: RateLimitMiddlewareOptions) => {
	return createMiddleware(async (c, next) => {
		const key = getRateLimitKey(c);
		if (!key) {
			throw new HTTPException(400, {
				res: c.json(
					{
						error: {
							code: "invalid_request",
							message: "Missing rate limit key",
						},
					},
					400,
				),
			});
		}

		const limiter = rateLimiter(c);
		const { success } = await limiter.limit({ key });

		c.set(RATE_LIMIT_CONTEXT_KEY, success);

		if (!success) {
			throw new HTTPException(429, {
				res: c.json(
					{
						error: {
							code: "too_many_requests",
							message: "Too many requests",
						},
					},
					429,
				),
			});
		}

		await next();
	});
};

export const isRateLimitOk = (c: Context): boolean => {
	return c.get(RATE_LIMIT_CONTEXT_KEY) ?? false;
};
