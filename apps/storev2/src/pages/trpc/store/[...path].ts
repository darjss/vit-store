import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

const canonicalStorePath = (path: string | undefined): string | null => {
	let decodedPath = path ?? "";
	try {
		for (let index = 0; index < 8; index++) {
			const next = decodeURIComponent(decodedPath);
			if (next === decodedPath) break;
			decodedPath = next;
		}
	} catch {
		return null;
	}

	const segments = decodedPath.split("/");
	if (
		segments.some(
			(segment) =>
				segment === "." || segment === ".." || segment.includes("\\"),
		)
	) {
		return null;
	}

	const nestedPath = segments.map(encodeURIComponent).join("/");
	return nestedPath ? `/trpc/store/${nestedPath}` : "/trpc/store";
};

export const ALL: APIRoute = async ({ request, params }) => {
	const targetPath = canonicalStorePath(params.path);
	if (!targetPath) {
		return Response.json({ error: "Invalid tRPC path" }, { status: 400 });
	}

	const targetUrl = new URL(request.url);
	targetUrl.pathname = targetPath;

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
