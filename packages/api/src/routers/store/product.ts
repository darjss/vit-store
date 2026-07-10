import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import { CACHE_POLICY, PRODUCTS_TAG, productTag } from "@vit/shared";
import * as v from "valibot";
import { runProductBenchmark } from "~/lib/benchmark/product-benchmark";
import { markCacheable } from "~/lib/cache/workers-cache";
import { redis } from "~/lib/redis";
import { publicProcedure, router } from "~/lib/trpc";
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
				const q = productQueries.store;
				const [sameCategory, sameBrand] = await Promise.all([
					q.getRecommendedProductsByCategory(input.categoryId, input.productId),
					q.getRecommendedProductsByBrand(input.brandId, input.productId),
				]);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);

				const allProducts = [...sameCategory, ...sameBrand];
				const uniqueProducts = allProducts.filter(
					(product, index, self) =>
						index === self.findIndex((p) => p.id === product.id),
				);

				return uniqueProducts.slice(0, 5).map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url || "",
					brand: product.brand.name,
					discount: product.discount,
					stock: product.stock,
				}));
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error getting recommended products",
					cause: error,
				});
			}
		}),

	subscribeToRestock: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				channel: v.picklist(["sms", "email"]),
				contact: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
			}),
		)
		.mutation(async ({ input }) => {
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

			const normalizedContact =
				input.channel === "sms"
					? input.contact.replace(/\D/g, "")
					: input.contact.trim().toLowerCase();

			if (input.channel === "sms" && !/^[6-9]\d{7}$/.test(normalizedContact)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid phone number",
				});
			}

			if (
				input.channel === "email" &&
				!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContact)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid email address",
				});
			}

			const subscriberId = `${input.channel}:${normalizedContact}`;
			const productSubscribersKey = `restock:subs:${input.productId}`;
			const subscriberDataKey = `restock:sub:${input.productId}:${subscriberId}`;

			await redis().sadd(productSubscribersKey, subscriberId);
			await redis().set(
				subscriberDataKey,
				JSON.stringify({
					productId: input.productId,
					channel: input.channel,
					contact: normalizedContact,
					createdAt: new Date().toISOString(),
				}),
				{ ex: 60 * 60 * 24 * 30 },
			);

			await redis().sadd("restock:watch:products", String(input.productId));

			return {
				success: true,
				message: "Subscription created",
			};
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
