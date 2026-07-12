import {
	sanitizePublicTrpcErrorShape,
	sanitizePublicTrpcResponse,
} from "@vit/shared";

export const isUnsupportedTrpcTransport = (request: Request): boolean =>
	request.headers.get("trpc-accept") === "application/jsonl";

export const noStoreJson = (
	body: unknown,
	status: number,
	initialHeaders?: HeadersInit,
): Response => {
	const headers = new Headers(initialHeaders);
	headers.set("content-type", "application/json");
	headers.set("cache-control", "no-store");
	headers.set("cloudflare-cdn-cache-control", "no-store");
	headers.delete("cache-tag");
	headers.delete("content-length");
	return Response.json(body, { status, headers });
};

export const trpcErrorResponse = (
	status: number,
	message?: string,
	initialHeaders?: HeadersInit,
): Response => {
	const shape = sanitizePublicTrpcErrorShape(undefined, status);
	return noStoreJson(
		{
			error: {
				json: message ? { ...shape, message } : shape,
			},
		},
		status,
		initialHeaders,
	);
};

export const sanitizeUpstreamTrpcResponse = async (
	response: Response,
): Promise<Response> => {
	let payload: unknown;
	try {
		payload = await response.clone().json();
	} catch (error) {
		console.warn({
			event: "store_trpc_invalid_error_response",
			upstreamStatus: response.status,
			errorType: error instanceof Error ? error.name : typeof error,
		});
		return trpcErrorResponse(502);
	}

	const sanitized = sanitizePublicTrpcResponse(payload, response.status);
	if (!sanitized.hasError) {
		return response.status >= 400
			? trpcErrorResponse(response.status)
			: response;
	}
	return noStoreJson(sanitized.payload, response.status, response.headers);
};
