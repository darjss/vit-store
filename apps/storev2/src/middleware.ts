import { defineMiddleware } from "astro:middleware";

/**
 * Paths that should never be edge-cached — user-specific or dynamic content.
 * Kept for future re-enablement; the HTML edge cache itself is disabled below.
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

// HTML edge cache disabled (LBL-1). The storefront HTML cache lived in the
// storev2 Worker's caches.default while admin mutations run in the API Worker,
// so there was no cross-Worker purge path — edited products stayed stale for
// the full 6h TTL. Catalog caching now relies on the API Worker's Workers
// Cache (GET tRPC queries tagged with Cache-Tag, purged by admin mutations
// via purgeTags). If HTML edge caching is re-enabled, it must either move
// into the API Worker or have a cross-Worker purge endpoint.
const HTML_EDGE_CACHE_ENABLED = false;

function edgeCacheControl(pathname: string): string {
  const isCatalogSurface =
    pathname === "/" ||
    pathname === "/products" ||
    pathname.startsWith("/products/");
  return isCatalogSurface
    ? "public, s-maxage=21600, stale-while-revalidate=86400"
    : "public, s-maxage=60, stale-while-revalidate=300";
}

function isPublicHtmlPath(pathname: string): boolean {
	const normalizedPath =
		pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

	return (
		normalizedPath === "/" ||
		normalizedPath === "/products" ||
		/^\/products\/[^/]+-\d+$/.test(normalizedPath) ||
		/^\/products\/(?:brand|category)\/[^/]+\/\d+$/.test(normalizedPath)
	);
}

function setNoStore(response: Response): void {
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	response.headers.delete("Cache-Tag");
}

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	// Keep the canonical robots endpoint clean. Some crawlers/tools probe both forms.
	if (url.pathname === "/robots.txt/") {
		context.cache.set(false);
		const response = context.redirect("/robots.txt", 301);
		setNoStore(response);
		return response;
	}

	const isPublicHtml = isPublicHtmlPath(url.pathname);
	const hasPersonalization =
		context.request.headers.has("cookie") ||
		context.request.headers.has("authorization");
	const mustBypassCache =
		context.request.method !== "GET" || !isPublicHtml || hasPersonalization;

	// Route caching is opt-in in page code. Mark every other request as an
	// explicit bypass before rendering, including the same public paths when a
	// customer sends cookies or authorization headers.
	if (mustBypassCache) {
		context.cache.set(false);
	}

	if (HTML_EDGE_CACHE_ENABLED && context.request.method === "GET" && isCacheablePath(url.pathname)) {
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
	if (
		mustBypassCache ||
		response.status >= 300 ||
		response.headers.has("set-cookie")
	) {
		context.cache.set(false);
		setNoStore(response);
	} else if (isPublicHtml) {
		// Workers Cache honors Vary. Keeping the anonymous variant separate from
		// cookie-bearing requests prevents a personalized render from reusing a
		// public HTML entry, while the cookie response itself is no-store.
		const vary = response.headers.get("Vary");
		response.headers.set("Vary", vary ? `${vary}, Cookie` : "Cookie");
	}
	return response;
});
