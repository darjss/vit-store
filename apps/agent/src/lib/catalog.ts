import { TRPCClientError } from "@trpc/client";
import {
	type AiOperationError,
	type AssistantAdviceProduct,
	assistantAdviceProductSchema,
	type AssistantProduct,
	assistantProductSchema,
} from "@vit/assistant";
import { Result } from "better-result";
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

type CatalogFailure = Extract<
	AiOperationError,
	{ _tag: "ProviderUnavailable" }
>;

const catalogOperation = async <Value>(operation: () => Promise<Value>) => {
	try {
		return Result.ok<Value, CatalogFailure>(await operation());
	} catch (error) {
		if (
			error instanceof TRPCClientError ||
			error instanceof TypeError ||
			(error instanceof DOMException && error.name === "TimeoutError")
		) {
			return Result.err<Value, CatalogFailure>({
				_tag: "ProviderUnavailable",
				retryable: true,
			});
		}
		throw error;
	}
};

export const searchAssistantProducts = async (
	query: string,
	limit: number,
	signal?: AbortSignal,
) =>
	catalogOperation(async () => {
		const data = await storeClient().product.searchProductsForAssistant.query(
			{ query, limit },
			{ signal: withTimeout(signal) },
		);
		return v.parse(assistantProductsSchema, data);
	});

// Resolves products by id using the existing storefront projection
// (`getProductsByIdsForAssistant`, #19) so the cart never duplicates catalog
// logic. Used when a Захиалах postback carries a product id and the cart needs
// the name/price/image snapshot for that line. Returns only the ids that still
// resolve, in catalog order.
export const getAssistantProductsByIds = async (
	ids: number[],
	signal?: AbortSignal,
) => {
	if (ids.length === 0) {
		return Result.ok<AssistantProduct[], CatalogFailure>([]);
	}
	return catalogOperation(async () => {
		const data = await storeClient().product.getProductsByIdsForAssistant.query(
			{ ids },
			{ signal: withTimeout(signal) },
		);
		return v.parse(assistantProductsSchema, data);
	});
};

// Resolves the label-data projection for the customer assistant's advice tool
// (#22) via the existing storefront catalog (`getProductsByIdsForAdvice`), so
// the advice answers come from real catalog data and never duplicate catalog
// logic here. Returns only the ids that still resolve, in request order.
export const getAdviceProductsByIds = async (
	ids: number[],
	signal?: AbortSignal,
) => {
	if (ids.length === 0) {
		return Result.ok<AssistantAdviceProduct[], CatalogFailure>([]);
	}
	return catalogOperation(async () => {
		const data = await storeClient().product.getProductsByIdsForAdvice.query(
			{ ids },
			{ signal: withTimeout(signal) },
		);
		return v.parse(assistantAdviceProductsSchema, data);
	});
};
