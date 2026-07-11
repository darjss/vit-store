import { defineMiddleware } from "astro:middleware";

function setNoStore(response: Response): void {
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	response.headers.delete("Cache-Tag");
}

// Storefront SSR HTML stays uncached so each response references assets from
// the currently deployed Worker. Static assets keep their explicit headers.
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
