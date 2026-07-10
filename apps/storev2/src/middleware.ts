import { defineMiddleware } from "astro:middleware";

function setNoStore(response: Response): void {
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	response.headers.delete("Cache-Tag");
}

// Storefront HTML stays uncached until API-to-storefront invalidation has a
// secure, verified cross-Worker channel. This middleware is the sole HTML
// cache policy owner; static assets keep their explicit public headers.
export const onRequest = defineMiddleware(async (context, next) => {
	const url = new URL(context.request.url);

	if (url.pathname === "/robots.txt/") {
		const response = context.redirect("/robots.txt", 301);
		setNoStore(response);
		return response;
	}

	const response = await next();
	setNoStore(response);
	return response;
});
