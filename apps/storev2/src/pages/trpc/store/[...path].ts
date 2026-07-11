import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import {
	isUnsupportedTrpcTransport,
	noStoreJson,
	sanitizeUpstreamTrpcResponse,
	trpcErrorResponse,
} from "@/lib/trpc-proxy";

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
		return noStoreJson({ error: "Invalid tRPC path" }, 400);
	}

	if (!import.meta.env.DEV && isUnsupportedTrpcTransport(request)) {
		return trpcErrorResponse(
			400,
			"Streaming tRPC transport is not supported by the storefront",
		);
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

	const upstreamRequest = new Request(targetUrl, init);
	let upstreamResponse: Response;
	try {
		upstreamResponse = await env.server.fetch(upstreamRequest);
	} catch (error) {
		console.error({
			event: "store_trpc_transport_rejected",
			method: request.method,
			errorType: error instanceof Error ? error.name : typeof error,
		});
		return trpcErrorResponse(503, "Store API temporarily unavailable", {
			"retry-after": "1",
		});
	}

	if (
		!import.meta.env.DEV &&
		(upstreamResponse.status === 207 || upstreamResponse.status >= 400)
	) {
		return sanitizeUpstreamTrpcResponse(upstreamResponse);
	}

	return new Response(upstreamResponse.body, upstreamResponse);
};
