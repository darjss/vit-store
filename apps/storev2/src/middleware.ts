import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	const url = new URL(context.request.url);

	// Keep the canonical robots endpoint clean. Some crawlers/tools probe both forms.
	if (url.pathname === "/robots.txt/") {
		return context.redirect("/robots.txt", 301);
	}

	const isAssetOrFile = /\/[^/]+\.[^/]+$/.test(url.pathname);
	const isBackendOrApiRoute =
		url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/");
	if (
		url.pathname !== "/" &&
		!url.pathname.endsWith("/") &&
		!isAssetOrFile &&
		!isBackendOrApiRoute
	) {
		url.pathname = `${url.pathname}/`;
		return context.redirect(`${url.pathname}${url.search}`, 301);
	}

	return next();
});
