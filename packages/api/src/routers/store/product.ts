import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import type { ProductError, RestockError } from "@vit/shared";
import {
	CACHE_POLICY,
	PRODUCTS_TAG,
	inventoryTag,
	productLookupResultSchemas,
	productSearchPageResultSchemas,
	productTag,
	restockSubscriptionResultSchemas,
	serializeResult,
	storefrontSearchResultSchemas,
} from "@vit/shared";
import { PRODUCT_SORT_DIRECTIONS } from "@vit/shared/domain/product";
import { match } from "dismatch";
import * as v from "valibot";
import { runProductBenchmark } from "~/lib/benchmark/product-benchmark";
import { markCacheable } from "~/lib/cache/workers-cache";
import { PRODUCT_SEARCH_SORT_FIELDS } from "~/lib/product-search/types";
import {
	getHomeProductsOperation,
	getInfiniteProductsOperation,
	getPaginatedProductsOperation,
	getProductByIdOperation,
	getProductInventoryOperation,
	getRecommendedProductsOperation,
	getTotalActiveProductCountOperation,
	searchProductsForPageOperation,
	searchStorefrontOperation,
} from "~/operations/product/storefront";
import { subscribeToRestockOperation } from "~/operations/restock/subscribe";
import type { LegacyTrpcError } from "~/result/legacy-trpc";
import { toLegacyTrpc } from "~/result/legacy-trpc";
import { customerProcedure, publicProcedure, router } from "~/lib/trpc";
import {
	mapStockStatus,
	performAssistantProductSearch,
} from "./product-search-helpers";

const infiniteProductsInput = {
	cursor: v.optional(v.string()),
	limit: v.optional(v.number(), 10),
	brandId: v.optional(v.number(), 0),
	categoryId: v.optional(v.number(), 0),
	listType: v.optional(v.picklist(["featured", "recent", "discount"])),
	searchTerm: v.optional(v.string()),
	sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	requireStock: v.optional(v.boolean(), false),
};

const paginatedProductsInput = {
	page: v.pipe(v.number(), v.integer(), v.minValue(1)),
	pageSize: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
		24,
	),
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	listType: v.optional(v.picklist(["featured", "recent", "discount"])),
	sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	requireStock: v.optional(v.boolean(), false),
};

const inventoryInput = {
	productIds: v.pipe(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
		v.minLength(1),
		v.maxLength(100),
	),
};

const searchInput = {
	query: v.pipe(v.string(), v.minLength(1)),
	limit: v.optional(v.number(), 8),
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	requireStock: v.optional(v.boolean(), false),
};

const searchPageInput = {
	query: v.pipe(v.string(), v.minLength(1)),
	page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
	pageSize: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
		12,
	),
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	requireStock: v.optional(v.boolean(), false),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	sortField: v.optional(v.picklist(PRODUCT_SEARCH_SORT_FIELDS)),
	sortDirection: v.optional(v.picklist(PRODUCT_SORT_DIRECTIONS)),
};

const toLegacyProductError = (error: ProductError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		ProductNotFound: () => ({
			code: "NOT_FOUND",
			message: "Product not found",
		}),
		ProductUnavailable: () => ({
			code: "BAD_REQUEST",
			message: "Product is unavailable",
		}),
		InsufficientStock: () => ({
			code: "BAD_REQUEST",
			message: "Insufficient stock",
		}),
		SearchUnavailable: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to search products",
		}),
	});

const toLegacyRestockError = (error: RestockError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		InvalidContact: ({ channel }) => ({
			code: "BAD_REQUEST",
			message:
				channel === "sms" ? "Invalid phone number" : "Invalid email address",
		}),
		ContactNotVerified: () => ({
			code: "UNAUTHORIZED",
			message: "Verified phone ownership is required",
		}),
		SubscriptionLimitReached: () => ({
			code: "BAD_REQUEST",
			message: "Too many open restock waitlists for this contact",
		}),
		RestockRateLimited: () => ({
			code: "TOO_MANY_REQUESTS",
			message: "Too many restock subscription requests",
		}),
		ProductNotFound: () => ({
			code: "NOT_FOUND",
			message: "Product not found",
		}),
		ProductAlreadyInStock: () => ({
			code: "BAD_REQUEST",
			message: "Product is already in stock",
		}),
	});

const searchPageOperationInput = (input: {
	query: string;
	page: number;
	pageSize: number;
	brandId?: number;
	categoryId?: number;
	requireStock: boolean;
	minPrice?: number;
	maxPrice?: number;
	sortField?: "price" | "createdAt";
	sortDirection?: "asc" | "desc";
}) => ({
	query: input.query,
	page: input.page,
	pageSize: input.pageSize,
	filters: {
		brandId: input.brandId,
		categoryId: input.categoryId,
		requireStock: input.requireStock,
		minPrice: input.minPrice,
		maxPrice: input.maxPrice,
	},
	sort:
		input.sortField && input.sortDirection
			? { field: input.sortField, direction: input.sortDirection }
			: undefined,
});

const requestIp = (ctx: {
	c: { req: { header: (name: string) => string | undefined } };
}) =>
	ctx.c.req.header("cf-connecting-ip") ??
	ctx.c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
	"unknown";

export const product = router({
	// Catalogue search returns an exact constrained total plus one page. Unlike
	// the lightweight search takeover, this contract never treats a capped
	// result array as the complete matching set.
	searchProductsForPage: publicProcedure
		.input(v.object(searchPageInput))
		.query(async ({ input }) =>
			toLegacyTrpc(
				await searchProductsForPageOperation(searchPageOperationInput(input)),
				toLegacyProductError,
			),
		),
	searchStorefront: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ input }) =>
			toLegacyTrpc(
				await searchStorefrontOperation(input),
				toLegacyProductError,
			),
		),
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		const products = await getHomeProductsOperation();
		markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
		return products;
	}),

	getPrerenderProducts: publicProcedure.query(async ({ ctx }) => {
		const q = productQueries.store;
		const products = await q.getPrerenderProducts();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return products;
	}),

	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await getProductByIdOperation(input.id);
			markCacheable(ctx, CACHE_POLICY.productDetail, [
				PRODUCTS_TAG,
				productTag(input.id),
			]);
			return result.match({ ok: (product) => product, err: () => null });
		}),

	getInventory: publicProcedure
		.input(v.object(inventoryInput))
		.query(async ({ ctx, input }) => {
			const products = await getProductInventoryOperation(input.productIds);
			markCacheable(
				ctx,
				CACHE_POLICY.inventory,
				products.map((product) => inventoryTag(product.id)),
			);
			return products;
		}),

	searchProductsForAssistant: publicProcedure
		.input(v.object(searchInput))
		.query(async ({ input }) => {
			try {
				return await performAssistantProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	getProductsByIdsForAssistant: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			const q = productQueries.store;
			const results = await q.getProductsByIdsWithDetails(input.ids);
			const byId = new Map(results.map((product) => [product.id, product]));

			return input.ids
				.map((id) => byId.get(id))
				.filter((product): product is NonNullable<typeof product> => !!product)
				.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url || "",
					brand: product.brand?.name || "",
					stockStatus: mapStockStatus(product.status, product.stock),
				}));
		}),

	getProductsByIdsForAdvice: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			const q = productQueries.store;
			const results = await q.getProductsByIdsForAdvice(input.ids);
			const byId = new Map(results.map((product) => [product.id, product]));

			return input.ids
				.map((id) => byId.get(id))
				.filter((product): product is NonNullable<typeof product> => !!product)
				.map((product) => ({
					id: product.id,
					name: product.name,
					brand: product.brand?.name ?? "",
					category: product.category?.name ?? "",
					description: product.description ?? "",
					ingredients: product.ingredients ?? [],
					amount: product.amount ?? "",
					potency: product.potency ?? "",
					dailyIntake: product.dailyIntake ?? 0,
					price: product.price,
				}));
		}),

	getRecommendedProducts: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				categoryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				brandId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const products = await getRecommendedProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),

	getCartCrossSells: publicProcedure
		.input(
			v.object({
				productIds: v.pipe(
					v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
					v.maxLength(20),
				),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const products = await productQueries.store.getCartCrossSells(
					input.productIds,
				);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error getting cart cross-sells",
					cause: error,
				});
			}
		}),

	subscribeToRestock: customerProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				contacts: v.pipe(
					v.array(
						v.object({
							channel: v.literal("sms"),
							contact: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
						}),
					),
					v.minLength(1),
					v.maxLength(1),
				),
			}),
		)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(
				await subscribeToRestockOperation(
					{ ...input, requestIp: requestIp(ctx) },
					ctx.session.user,
				),
				toLegacyRestockError,
			),
		),
	getProductBenchmark: publicProcedure.query(async () => {
		try {
			return await runProductBenchmark();
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run benchmark",
				cause: error,
			});
		}
	}),

	getInfiniteProducts: publicProcedure
		.input(v.object(infiniteProductsInput))
		.query(async ({ ctx, input }) => {
			const products = await getInfiniteProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),

	getPaginatedProducts: publicProcedure
		.input(v.object(paginatedProductsInput))
		.query(async ({ ctx, input }) => {
			const products = await getPaginatedProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),

	getTotalActiveProductCount: publicProcedure.query(async ({ ctx }) => {
		const count = await getTotalActiveProductCountOperation();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return count;
	}),
});

export const productV2Router = router({
	searchProductsForPage: publicProcedure
		.input(v.object(searchPageInput))
		.query(async ({ input }) =>
			serializeResult(
				await searchProductsForPageOperation(searchPageOperationInput(input)),
				productSearchPageResultSchemas,
			),
		),
	searchStorefront: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ input }) =>
			serializeResult(
				await searchStorefrontOperation(input),
				storefrontSearchResultSchemas,
			),
		),
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		const products = await getHomeProductsOperation();
		markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
		return products;
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await getProductByIdOperation(input.id);
			markCacheable(ctx, CACHE_POLICY.productDetail, [
				PRODUCTS_TAG,
				productTag(input.id),
			]);
			return serializeResult(result, productLookupResultSchemas);
		}),
	getInventory: publicProcedure
		.input(v.object(inventoryInput))
		.query(async ({ ctx, input }) => {
			const products = await getProductInventoryOperation(input.productIds);
			markCacheable(
				ctx,
				CACHE_POLICY.inventory,
				products.map((product) => inventoryTag(product.id)),
			);
			return products;
		}),
	getRecommendedProducts: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				categoryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				brandId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const products = await getRecommendedProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),
	subscribeToRestock: customerProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				contacts: v.pipe(
					v.array(
						v.object({
							channel: v.literal("sms"),
							contact: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
						}),
					),
					v.minLength(1),
					v.maxLength(1),
				),
			}),
		)
		.mutation(async ({ input, ctx }) =>
			serializeResult(
				await subscribeToRestockOperation(
					{ ...input, requestIp: requestIp(ctx) },
					ctx.session.user,
				),
				restockSubscriptionResultSchemas,
			),
		),
	getInfiniteProducts: publicProcedure
		.input(v.object(infiniteProductsInput))
		.query(async ({ ctx, input }) => {
			const products = await getInfiniteProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),
	getPaginatedProducts: publicProcedure
		.input(v.object(paginatedProductsInput))
		.query(async ({ ctx, input }) => {
			const products = await getPaginatedProductsOperation(input);
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return products;
		}),
	getTotalActiveProductCount: publicProcedure.query(async ({ ctx }) => {
		const count = await getTotalActiveProductCountOperation();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return count;
	}),
});
