import { createTRPCClient, httpLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
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
// catalog logic is never duplicated here. This now rides the SAME typed tRPC
// client the storefront uses (`createTRPCClient<StoreRouter>`); `StoreRouter` is
// a TYPE-ONLY import (`import type`), so it is erased at build and pulls zero
// api/server/db runtime code into the worker — only @trpc/client + superjson.
const storeApiUrl = (): string => {
	const base = process.env.STORE_API_URL ?? "http://localhost:3000";
	return `${base.replace(/\/+$/, "")}/trpc/store`;
};

// Deadline for the catalog round-trip. A hung/slow store API must not hold the
// whole agent turn open until the Worker platform kills it.
const CATALOG_FETCH_TIMEOUT_MS = 10_000;

const assistantProductsSchema = v.array(assistantProductSchema);
const assistantAdviceProductsSchema = v.array(assistantAdviceProductSchema);

// Lazily constructed so STORE_API_URL is read at call time (mirrors the prior
// hand-rolled boundary), not at module load.
let cachedClient: ReturnType<typeof createTRPCClient<StoreRouter>> | undefined;
const client = () => {
	cachedClient ??= createTRPCClient<StoreRouter>({
		links: [httpLink({ url: storeApiUrl(), transformer: SuperJSON })],
	});
	return cachedClient;
};

// Honor the tool turn's cancellation if present, and always enforce our own
// timeout, whichever fires first.
const withTimeout = (signal?: AbortSignal): AbortSignal => {
	const timeout = AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

export const searchAssistantProducts = async (
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<AssistantProduct[]> => {
	const data = await client().product.searchProductsForAssistant.query(
		{ query, limit },
		{ signal: withTimeout(signal) },
	);
	// Defense-in-depth: the typed client gives compile-time safety, but the
	// valibot guard still fails loudly on RUNTIME api-side shape drift.
	return v.parse(assistantProductsSchema, data);
};

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
	const data = await client().product.getProductsByIdsForAssistant.query(
		{ ids },
		{ signal: withTimeout(signal) },
	);
	return v.parse(assistantProductsSchema, data);
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
	const data = await client().product.getProductsByIdsForAdvice.query(
		{ ids },
		{ signal: withTimeout(signal) },
	);
	return v.parse(assistantAdviceProductsSchema, data);
};
