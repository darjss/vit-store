import { type AssistantProduct, assistantProductSchema } from "@vit/assistant";
import { SuperJSON } from "superjson";
import * as v from "valibot";

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

// Deadline for the catalog round-trip. A hung/slow store API must not hold the
// whole agent turn open until the Worker platform kills it.
const CATALOG_FETCH_TIMEOUT_MS = 10_000;

const assistantProductsSchema = v.array(assistantProductSchema);

export const searchAssistantProducts = async (
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<AssistantProduct[]> => {
	const input = encodeURIComponent(
		JSON.stringify(SuperJSON.serialize({ query, limit })),
	);
	const url = `${storeApiUrl()}/product.searchProductsForAssistant?input=${input}`;

	// Honor the tool turn's cancellation if present, and always enforce our own
	// timeout, whichever fires first.
	const timeout = AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS);
	const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

	const response = await fetch(url, {
		method: "GET",
		headers: { "content-type": "application/json" },
		signal: fetchSignal,
	});
	if (!response.ok) {
		throw new Error(`product search request failed (${response.status})`);
	}

	const body = (await response.json()) as TrpcQueryResponse;
	if (body.error || !body.result) {
		throw new Error(body.error?.message ?? "product search returned an error");
	}

	// Validate the untyped wire payload against the shared contract so api-side
	// shape drift fails loudly here instead of producing a dead order button.
	const deserialized = SuperJSON.deserialize(
		body.result.data as Parameters<typeof SuperJSON.deserialize>[0],
	);
	return v.parse(assistantProductsSchema, deserialized);
};
