import { SuperJSON } from "superjson";

/** Build a tRPC GET/POST JSON body for a local fixture server. */
export function trpcResponse<T>(data: T) {
	return JSON.stringify({ result: { data: SuperJSON.serialize(data) } });
}

export function trpcResponseBody<T>(data: T) {
	return new Response(trpcResponse(data), {
		headers: { "content-type": "application/json" },
	});
}
