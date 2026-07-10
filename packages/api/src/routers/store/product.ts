import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import {
	CACHE_POLICY,
	PRODUCTS_TAG,
	inventoryTag,
	productTag,
} from "@vit/shared";
import * as v from "valibot";
import { runProductBenchmark } from "~/lib/benchmark/product-benchmark";
import { markCacheable } from "~/lib/cache/workers-cache";
import { subscribeToRestock } from "~/lib/restock";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import {
	mapStockStatus,
	performAssistantProductSearch,
	performProductSearch,
	searchNavigationResults,
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

export const product = router({
	// Storefront search — used by the catalog list (search mode) and the
	// search takeover. The `WithStock` variant is collapsed: callers pass
	// `requireStock: true` if they need the in-stock-only gate.
	searchProductsForPage: publicProcedure
		.input(v.object(searchInput))
		.query(async ({ ctx, input }) => {
			try {
				const products = await performProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
					requireStock: input.requireStock,
				});
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),
	searchStorefront: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const safeLimit = Math.min(input.limit, 12);
				const [products, navigation] = await Promise.all([
					performProductSearch(input.query, safeLimit),
					searchNavigationResults(input.query, 4),
				]);

				return {
					products,
					brands: navigation.brands,
					categories: navigation.categories,
				};
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search storefront",
					cause: error,
				});
			}
		}),
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					q.getFeaturedProducts(),
					q.getNewProducts(),
					q.getDiscountedProducts(),
				]);
			markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
			return {
				featuredProducts: featuredProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				newProducts: newProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				discountedProducts: discountedProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					discount: product.discount,
					stock: product.stock,
				})),
			};
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error getting products for home",
				cause: error,
			});
		}
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
			const q = productQueries.store;
			const result = await q.getProductById(input.id);
			markCacheable(ctx, CACHE_POLICY.productDetail, [
				PRODUCTS_TAG,
				productTag(input.id),
			]);
			if (result === null || result === undefined) {
				return null;
			}

			return {
				...result,
				stock: result.stock,
				images: result.images.map((image) => ({
					url: image.url,
					isPrimary: image.isPrimary,
				})),
			};
		}),

	getInventory: publicProcedure
		.input(v.object(inventoryInput))
		.query(async ({ ctx, input }) => {
			const products = await productQueries.store.getProductInventory(
				input.productIds,
			);
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
			try {
				const products = await productQueries.store.getRecommendations(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error getting recommended products",
					cause: error,
				});
			}
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

	subscribeToRestock: verifiedCustomerProcedure
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
		.mutation(async ({ input, ctx }) => {
			const q = productQueries.store;
			const product = await q.getProductStockStatus(input.productId);

			if (!product) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Product not found",
				});
			}

			if (product.stock > 0 && product.status !== "out_of_stock") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Product is already in stock",
				});
			}

			return subscribeToRestock({
				...input,
				verifiedPhone: String(ctx.session.user.phone),
				requestIp:
					ctx.c.req.header("cf-connecting-ip") ??
					ctx.c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
					"unknown",
			});
		}),
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
			try {
				const q = productQueries.store;
				const products = await q.getInfiniteProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get infinite products",
					cause: error,
				});
			}
		}),

	getPaginatedProducts: publicProcedure
		.input(v.object(paginatedProductsInput))
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getPaginatedProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get paginated products",
					cause: error,
				});
			}
		}),

	getTotalActiveProductCount: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const count = await q.getTotalActiveProductCount();
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return count;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get total product count",
				cause: error,
			});
		}
	}),
});
