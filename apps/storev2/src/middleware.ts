import { defineMiddleware } from "astro:middleware";

/**
 * Paths that should never be edge-cached — user-specific or dynamic content.
 */
function isCacheablePath(pathname: string): boolean {
  return (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/order/") &&
    !pathname.startsWith("/payment/") &&
    !pathname.startsWith("/og/") &&
    pathname !== "/login" &&
    pathname !== "/checkout" &&
    pathname !== "/cart" &&
    pathname !== "/profile" &&
    pathname !== "/order-tracking"
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	// Keep the canonical robots endpoint clean. Some crawlers/tools probe both forms.
	if (url.pathname === "/robots.txt/") {
		return context.redirect("/robots.txt", 301);
	}

	// Check edge cache BEFORE rendering. Cache API (caches.default) stores
	// responses in the Worker's edge cache — this is the only way to cache
	// Worker responses; setting Cache-Control headers alone doesn't work.
	if (context.request.method === "GET" && isCacheablePath(url.pathname)) {
		try {
			const cache = (caches as unknown as { default: Cache }).default;
			const cacheKey = new Request(url.toString(), { method: "GET" });
			const cached = await cache.match(cacheKey);
			if (cached) {
				const hitResponse = new Response(cached.body, cached);
				hitResponse.headers.set("X-Edge-Cache", "HIT");
				return hitResponse;
			}
			// MISS — render, then cache the result.
			const response = await next();
			if (response.status === 200) {
				response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
				response.headers.set("X-Edge-Cache", "MISS");
				(context as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(
					cache.put(cacheKey, response.clone()),
				);
			}
			return response;
		} catch {
			// Cache API not available (e.g. local dev) — fall through.
		}
	}

	return next();
});
