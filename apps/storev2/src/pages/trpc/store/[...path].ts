import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

export const ALL: APIRoute = async ({ request, params }) => {
	const targetUrl = new URL(request.url);
	const trpcPath = params.path ? `/${params.path}` : "";
	targetUrl.pathname = `/trpc/store${trpcPath}`;

	const headers = new Headers(request.headers);
	headers.delete("host");
	headers.delete("content-length");

	const init: RequestInit = {
		method: request.method,
		headers,
		redirect: "manual",
	};

	if (request.body && request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		(init as RequestInit & { duplex: "half" }).duplex = "half";
	}

	const upstreamResponse = await env.server.fetch(new Request(targetUrl, init));
	return new Response(upstreamResponse.body, upstreamResponse);
};
