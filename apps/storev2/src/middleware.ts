import { defineMiddleware } from "astro:middleware";

function isPublicHtmlPath(pathname: string): boolean {
	const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
	return (
		normalized === "/" ||
		normalized === "/products" ||
		/^\/products\/[^/]+-\d+$/.test(normalized) ||
		/^\/products\/(?:brand|category)\/[^/]+\/\d+$/.test(normalized)
	);
}

function setNoStore(response: Response): void {
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	response.headers.delete("Cache-Tag");
}

export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	if (url.pathname === "/robots.txt/") {
		const response = context.redirect("/robots.txt", 301);
		setNoStore(response);
		return response;
	}

	const isPublicHtml = isPublicHtmlPath(url.pathname);
	const mustBypass = context.request.method !== "GET" || !isPublicHtml;

	if (mustBypass) {
		context.cache.set(false);
	}

	const response = await next();
	if (
		mustBypass ||
		response.status >= 300 ||
		response.headers.has("set-cookie")
	) {
		context.cache.set(false);
		setNoStore(response);
	}
	return response;
});
