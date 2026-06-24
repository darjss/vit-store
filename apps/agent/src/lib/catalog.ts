import type { AssistantProduct } from "@vit/assistant";
import { SuperJSON } from "superjson";

// Boundary to the existing storefront catalog search. The search itself lives
// in the api package (store product router, `searchProductsForAssistant`); the
// agent only calls it over the same tRPC surface the storefront uses, so the
// catalog logic is never duplicated here. A thin hand-rolled tRPC GET keeps the
// worker free of the heavy api/tRPC client type graph.
const storeApiUrl = (): string => {
	const base = process.env.STORE_API_URL ?? "http://localhost:3000";
	return `${base.replace(/\/+$/, "")}/trpc/store`;
};

interface TrpcQueryResponse {
	result?: { data?: unknown };
	error?: { message?: string };
}

export const searchAssistantProducts = async (
	query: string,
	limit: number,
): Promise<AssistantProduct[]> => {
	const input = encodeURIComponent(
		JSON.stringify(SuperJSON.serialize({ query, limit })),
	);
	const url = `${storeApiUrl()}/product.searchProductsForAssistant?input=${input}`;

	const response = await fetch(url, {
		method: "GET",
		headers: { "content-type": "application/json" },
	});
	if (!response.ok) {
		throw new Error(`product search request failed (${response.status})`);
	}

	const body = (await response.json()) as TrpcQueryResponse;
	if (body.error || !body.result) {
		throw new Error(body.error?.message ?? "product search returned an error");
	}

	return SuperJSON.deserialize<AssistantProduct[]>(
		body.result.data as Parameters<typeof SuperJSON.deserialize>[0],
	);
};
