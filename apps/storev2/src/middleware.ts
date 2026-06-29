import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	// Keep the canonical robots endpoint clean. Some crawlers/tools probe both forms.
	if (url.pathname === "/robots.txt/") {
		return context.redirect("/robots.txt", 301);
	}

	const response = await next();

	// Edge-cache HTML pages for a short window. Pages with user-specific
	// content (login, checkout, order, profile, cart, account) are excluded.
	// Cloudflare serves stale content while revalidating.
	const pathname = url.pathname;
	const isCacheable =
		response.status === 200 &&
		!pathname.startsWith("/api/") &&
		!pathname.startsWith("/order/") &&
		!pathname.startsWith("/payment/") &&
		!pathname.startsWith("/og/") &&
		pathname !== "/login" &&
		pathname !== "/checkout" &&
		pathname !== "/cart" &&
		pathname !== "/profile" &&
		pathname !== "/order-tracking";

	if (isCacheable && !response.headers.has("Cache-Control")) {
		response.headers.set(
			"Cache-Control",
			"public, s-maxage=60, stale-while-revalidate=300",
		);
	}

	return response;
});
