import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	const url = new URL(context.request.url);

	// Keep the canonical robots endpoint clean. Some crawlers/tools probe both forms.
	if (url.pathname === "/robots.txt/") {
		return context.redirect("/robots.txt", 301);
	}

	// Product detail pages are indexed with trailing slashes in the sitemap/canonicals.
	// Make the slash normalization permanent instead of Astro's default temporary redirect.
	if (
		url.pathname.startsWith("/products/") &&
		url.pathname !== "/products/" &&
		!url.pathname.endsWith("/") &&
		!url.pathname.includes(".")
	) {
		return context.redirect(`${url.pathname}/${url.search}`, 301);
	}

	return next();
});
