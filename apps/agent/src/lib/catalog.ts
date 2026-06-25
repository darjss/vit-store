import {
	type AssistantAdviceProduct,
	assistantAdviceProductSchema,
	type AssistantProduct,
	assistantProductSchema,
} from "@vit/assistant";
import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

// Boundary to the existing storefront catalog search. The search itself lives
// in the api package (store product router, `searchProductsForAssistant`); the
// agent only calls it over the same tRPC surface the storefront uses, so the
// catalog logic is never duplicated here. This rides the SHARED typed tRPC
// client (`storeClient()` in ./store-client) the storefront pattern uses, so
// only @trpc/client + superjson reach the worker bundle — zero server/db code.
const assistantProductsSchema = v.array(assistantProductSchema);
const assistantAdviceProductsSchema = v.array(assistantAdviceProductSchema);

export const searchAssistantProducts = async (
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<AssistantProduct[]> => {
	const data = await storeClient().product.searchProductsForAssistant.query(
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
	const data = await storeClient().product.getProductsByIdsForAssistant.query(
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
	const data = await storeClient().product.getProductsByIdsForAdvice.query(
		{ ids },
		{ signal: withTimeout(signal) },
	);
	return v.parse(assistantAdviceProductsSchema, data);
};
