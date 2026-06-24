import {
	type AssistantAdviceProduct,
	assistantAdviceProductSchema,
	type AssistantProduct,
	assistantProductSchema,
} from "@vit/assistant";
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
const assistantAdviceProductsSchema = v.array(assistantAdviceProductSchema);

// Shared tRPC GET against the store product router. Validates the untyped wire
// payload against `schema` so api-side shape drift fails loudly here instead of
// producing a dead order button or a cart line with an undefined price.
const trpcGet = async <T>(
	procedure: string,
	payload: unknown,
	schema: v.GenericSchema<unknown, T>,
	signal?: AbortSignal,
): Promise<T> => {
	const input = encodeURIComponent(
		JSON.stringify(SuperJSON.serialize(payload)),
	);
	const url = `${storeApiUrl()}/${procedure}?input=${input}`;

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
		throw new Error(`${procedure} request failed (${response.status})`);
	}

	const body = (await response.json()) as TrpcQueryResponse;
	if (body.error || !body.result) {
		throw new Error(body.error?.message ?? `${procedure} returned an error`);
	}

	const deserialized = SuperJSON.deserialize(
		body.result.data as Parameters<typeof SuperJSON.deserialize>[0],
	);
	return v.parse(schema, deserialized);
};

export const searchAssistantProducts = async (
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<AssistantProduct[]> =>
	trpcGet(
		"product.searchProductsForAssistant",
		{ query, limit },
		assistantProductsSchema,
		signal,
	);

// Resolves products by id using the existing storefront projection
// (`getProductsByIdsForAssistant`, #19) so the cart never duplicates catalog
// logic. Used when a Захиалах postback carries a product id and the cart needs
// the name/price/image snapshot for that line. Returns only the ids that still
// resolve, in catalog order.
export const getAssistantProductsByIds = async (
	ids: number[],
	signal?: AbortSignal,
): Promise<AssistantProduct[]> => {
	if (ids.length === 0) return [];
	return trpcGet(
		"product.getProductsByIdsForAssistant",
		{ ids },
		assistantProductsSchema,
		signal,
	);
};

// Resolves the label-data projection for the customer assistant's advice tool
// (#22) via the existing storefront catalog (`getProductsByIdsForAdvice`), so
// the advice answers come from real catalog data and never duplicate catalog
// logic here. Returns only the ids that still resolve, in request order.
export const getAdviceProductsByIds = async (
	ids: number[],
	signal?: AbortSignal,
): Promise<AssistantAdviceProduct[]> => {
	if (ids.length === 0) return [];
	return trpcGet(
		"product.getProductsByIdsForAdvice",
		{ ids },
		assistantAdviceProductsSchema,
		signal,
	);
};
