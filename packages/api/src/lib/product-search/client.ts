import { env } from "cloudflare:workers";
import { type Result as BetterResult, Result } from "better-result";
import type { RequestLogger } from "evlog";
import * as v from "valibot";
import { logger } from "~/lib/logger";
import {
	PRODUCT_SEARCH_OBJECT_NAME,
	type ProductSearchFailure,
	type ProductSearchFilters,
	type ProductSearchPage,
	type ProductSearchRebuildReason,
	type ProductSearchSort,
	type ProductSearchStatus,
	productSearchInputSchema,
	productSearchPageSchema,
	productSearchStatusSchema,
	type SearchProductResult,
	searchProductResultSchema,
} from "~/lib/product-search/types";

const getProductSearchService = () =>
	env.PRODUCT_SEARCH.getByName(PRODUCT_SEARCH_OBJECT_NAME);

const PRODUCT_SEARCH_TIMEOUT_MS = 4000;

class ProductSearchTimeoutError extends Error {
	constructor() {
		super("Product search request timed out.");
		this.name = "ProductSearchTimeoutError";
	}
}

export class ProductSearchOperationError extends Error {
	constructor(readonly failure: ProductSearchFailure) {
		super("Product search operation failed.");
		this.name = "ProductSearchOperationError";
	}
}

export class ProductSearchUnavailableError extends ProductSearchOperationError {
	constructor(failure: ProductSearchFailure) {
		super(failure);
		this.name = "ProductSearchUnavailableError";
	}
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(() => reject(new ProductSearchTimeoutError()), ms),
		),
	]);

const classifyRpcFailure = (
	error: unknown,
): ProductSearchFailure | undefined => {
	if (error instanceof ProductSearchTimeoutError) {
		return {
			_tag: "RetryableSearchFailure",
			code: "timeout",
			retryable: true,
		};
	}
	if (typeof error === "object" && error !== null) {
		if ("overloaded" in error && error.overloaded === true) {
			return {
				_tag: "RetryableSearchFailure",
				code: "overloaded",
				retryable: true,
			};
		}
		if ("retryable" in error && error.retryable === true) {
			return {
				_tag: "RetryableSearchFailure",
				code: "provider_unavailable",
				retryable: true,
			};
		}
	}
	return undefined;
};

const rpcResult = async <Value>(
	operation: () => Promise<unknown>,
	schema: v.GenericSchema<unknown, Value>,
): Promise<BetterResult<Value, ProductSearchFailure>> => {
	let value: unknown;
	try {
		value = await withTimeout(operation(), PRODUCT_SEARCH_TIMEOUT_MS);
	} catch (error) {
		const failure = classifyRpcFailure(error);
		if (failure === undefined) throw error;
		return Result.err(failure);
	}
	const parsed = v.safeParse(schema, value);
	return parsed.success
		? Result.ok(parsed.output)
		: Result.err({
				_tag: "PermanentSearchFailure",
				code: "malformed_response",
				retryable: false,
			});
};

const legacyValue = <Value>(
	result: BetterResult<Value, ProductSearchFailure>,
) => {
	if (result.status === "error") {
		if (result.error._tag === "RetryableSearchFailure") {
			throw new ProductSearchUnavailableError(result.error);
		}
		throw new ProductSearchOperationError(result.error);
	}
	return result.value;
};

export const searchProductPageResult = async (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}) => {
	const parsed = v.safeParse(productSearchInputSchema, input);
	if (!parsed.success) {
		return Result.err<ProductSearchPage, ProductSearchFailure>({
			_tag: "InvalidSearchRequest",
			code: "invalid_request",
			retryable: false,
		});
	}
	return rpcResult(
		() => getProductSearchService().search(parsed.output),
		productSearchPageSchema,
	);
};

export const searchProductsResult = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
) => {
	const trimmed = query.trim();
	if (!trimmed) {
		return Result.ok<SearchProductResult[], ProductSearchFailure>([]);
	}
	const page = await searchProductPageResult({
		query: trimmed,
		page: 1,
		pageSize: limit,
		filters,
	});
	if (page.status === "error") {
		return Result.err<SearchProductResult[], ProductSearchFailure>(page.error);
	}
	const items = v.safeParse(
		v.array(searchProductResultSchema),
		page.value.items,
	);
	return items.success
		? Result.ok<SearchProductResult[], ProductSearchFailure>(items.output)
		: Result.err<SearchProductResult[], ProductSearchFailure>({
				_tag: "PermanentSearchFailure",
				code: "malformed_response",
				retryable: false,
			});
};

/** Legacy value adapter. It no longer converts search outages to empty hits. */
export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: ProductSearchFilters,
) => legacyValue(await searchProductsResult(query, limit, filters));

export const searchProductPage = async (input: {
	query: string;
	page: number;
	pageSize: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}) => legacyValue(await searchProductPageResult(input));

export const rebuildProductSearchIndexResult = async (
	reason: ProductSearchRebuildReason = "manual",
) =>
	rpcResult(
		() => getProductSearchService().rebuild(reason),
		productSearchStatusSchema,
	);

export const rebuildProductSearchIndex = async (
	reason: ProductSearchRebuildReason = "manual",
): Promise<ProductSearchStatus> =>
	legacyValue(await rebuildProductSearchIndexResult(reason));

export const getProductSearchStatusResult = async () =>
	rpcResult(
		() => getProductSearchService().getStatus(),
		productSearchStatusSchema,
	);

export const getProductSearchStatus = async (): Promise<ProductSearchStatus> =>
	legacyValue(await getProductSearchStatusResult());

export const clearProductSearchIndexResult = async () =>
	rpcResult(async () => {
		await getProductSearchService().clear();
		return undefined;
	}, v.undefined());

export const clearProductSearchIndex = async () => {
	legacyValue(await clearProductSearchIndexResult());
};

type RebuildContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<Record<string, unknown>>;
};

export const scheduleProductSearchRebuild = (
	ctx: RebuildContext,
	reason: ProductSearchRebuildReason,
): void => {
	ctx.c.executionCtx.waitUntil(
		rebuildProductSearchIndexResult(reason)
			.then((result) => {
				if (result.status === "error") {
					ctx.log.warn("product_search.rebuild_failed", {
						reason,
						error_tag: result.error._tag,
						code: result.error.code,
						retryable: result.error.retryable,
					});
				}
			})
			.catch(() => {
				logger.error(
					"product_search.rebuild_defect",
					new Error("Product search rebuild failed unexpectedly."),
				);
			}),
	);
};
