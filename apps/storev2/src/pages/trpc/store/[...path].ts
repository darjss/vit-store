import { env } from "cloudflare:workers";
import { sanitizePublicTrpcErrorShape } from "@vit/shared";
import type { APIRoute } from "astro";

export const prerender = false;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;

const sanitizeUpstreamError = async (response: Response): Promise<Response> => {
	let errorShape: unknown;
	try {
		const payload = asRecord(await response.json());
		const error = asRecord(payload?.error);
		errorShape = asRecord(error?.json) ?? error;
	} catch (error) {
		console.warn({
			event: "store_trpc_invalid_error_response",
			upstreamStatus: response.status,
			errorType: error instanceof Error ? error.name : typeof error,
		});
	}

	const headers = new Headers(response.headers);
	headers.set("content-type", "application/json");
	headers.set("cache-control", "no-store");
	headers.set("cloudflare-cdn-cache-control", "no-store");
	headers.delete("cache-tag");
	headers.delete("content-length");

	return Response.json(
		{
			error: {
				json: sanitizePublicTrpcErrorShape(errorShape, response.status),
			},
		},
		{ status: response.status, statusText: response.statusText, headers },
	);
};

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
		return Response.json(
			{
				error: {
					json: {
						message: "Store API temporarily unavailable",
						code: -32603,
						data: {
							code: "INTERNAL_SERVER_ERROR",
							httpStatus: 503,
						},
					},
				},
			},
			{
				status: 503,
				headers: {
					"cache-control": "no-store",
					"retry-after": "1",
				},
			},
		);
	}

	if (!import.meta.env.DEV && upstreamResponse.status >= 400) {
		return sanitizeUpstreamError(upstreamResponse);
	}

	return new Response(upstreamResponse.body, upstreamResponse);
};
