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

function edgeCacheControl(pathname: string): string {
  const isCatalogSurface =
    pathname === "/" ||
    pathname === "/products" ||
    pathname.startsWith("/products/");
  return isCatalogSurface
    ? "public, s-maxage=21600, stale-while-revalidate=86400"
    : "public, s-maxage=60, stale-while-revalidate=300";
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
			// The /products index always SSRs the same first 12 products
			// regardless of query params (filtering is client-side), so
			// normalize the cache key to the pathname to avoid storing
			// identical HTML under every ?category=&brand= variant.
			const isProductsIndex = url.pathname === "/products";
			const cacheKeyUrl = isProductsIndex
				? new URL(url.pathname, url.origin).toString()
				: url.toString();
			const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
			const cached = await cache.match(cacheKey);
			if (cached) {
				const hitResponse = new Response(cached.body, cached);
				hitResponse.headers.set("X-Edge-Cache", "HIT");
				return hitResponse;
			}
			// MISS — render, then cache the result.
			const response = await next();
			if (response.status === 200) {
				response.headers.set("Cache-Control", edgeCacheControl(url.pathname));
				response.headers.set("X-Edge-Cache", "MISS");
				(context as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(
					cache.put(cacheKey, response.clone()),
				);
			} else if (response.status >= 400) {
				response.headers.set("Cache-Control", "no-store");
			}
			return response;
		} catch {
			// Cache API not available (e.g. local dev) — fall through.
		}
	}

	const response = await next();
	if (response.status >= 400) {
		response.headers.set("Cache-Control", "no-store");
	}
	return response;
});
