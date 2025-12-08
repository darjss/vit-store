import { TRPCError } from "@trpc/server";
import { createQueries } from "@vit/api/queries";
import { isNull } from "drizzle-orm";
import * as v from "valibot";
import { ProductImagesTable, ProductsTable } from "../../db/schema";
import { publicProcedure, router } from "../../lib/trpc";
import { searchProducts } from "../../lib/upstash-search";

export const product = router({
	searchProducts: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				const { query, limit } = input;

				// Search using Upstash - returns all data needed for display
				const searchResults = await searchProducts(query, limit);

				// If Upstash returns results, return them directly (no DB query needed)
				if (searchResults.length > 0) {
					return searchResults;
				}

				// Fallback to Postgres LIKE search if Upstash returns nothing
				const q = createQueries(ctx.db).products.store;
				const fallbackResults = await q.searchByName(query, limit ?? 8);
				return fallbackResults.map((p) => ({
					id: p.id,
					slug: p.slug,
					name: p.name,
					price: p.price,
					image: p.images[0]?.url || "",
					brand: p.brand?.name || "",
				}));
			} catch (error) {
				console.error("Error searching products:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = createQueries(ctx.db).products.store;
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					q.getFeaturedProducts(),
					q.getNewProducts(),
					q.getDiscountedProducts(),
				]);
			return {
				featuredProducts: featuredProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
				})),
				newProducts: newProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
				})),
				discountedProducts: discountedProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					discount: product.discount,
				})),
			};
		} catch (error) {
			console.error("Error getting products for home:", error);
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error getting products for home",
				cause: error,
			});
		}
	}),
	getAllProducts: publicProcedure.query(async ({ ctx }) => {
		const q = createQueries(ctx.db).products.store;
		return await q.getAllProducts();
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const q = createQueries(ctx.db).products.store;
			const result = await q.getProductById(input.id);
			if (result === null || result === undefined) {
				return null;
			}
			result.images = result.images.map((image) => ({
				url: image.url,
				isPrimary: image.isPrimary,
			}));
			console.log(
				"result.ingredients",
				result.ingredients,
				typeof result.ingredients,
			);
			// result.ingredients = result.ingredients ? JSON.parse() : [];
			return result;
		}),
	getProductsByIds: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input, ctx }) => {
			const q = createQueries(ctx.db).products.store;
			const result = await q.getProductsByIds(input.ids);
			return result.map((product) => ({
				id: product.id,
				name: product.name,
				price: product.price,
				image: product.images[0]?.url,
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
		.query(async ({ input, ctx }) => {
			try {
				const q = createQueries(ctx.db).products.store;
				const [sameCategory, sameBrand] = await Promise.all([
					q.getRecommendedProductsByCategory(input.categoryId, input.productId),
					q.getRecommendedProductsByBrand(input.brandId, input.productId),
				]);

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
				}));
			} catch (error) {
				console.error("Error getting recommended products:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error getting recommended products",
					cause: error,
				});
			}
		}),
	isProductInStock: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			console.log("input.productId", input.productId);
			if (input.productId === 7) {
				return {
					isInStock: false,
				};
			}
			const q = createQueries(ctx.db).products.store;
			const product = await q.getProductStockStatus(input.productId);
			if (product === null || product === undefined) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Product not found",
				});
			}
			if (product.stock === 0 || product.status === "out_of_stock") {
				return {
					isInStock: false,
				};
			}
			return {
				isInStock: true,
			};
		}),
	getProductBenchmark: publicProcedure.query(async ({ ctx }) => {
		try {
			const cacheKey = "benchmark:products:5";

			// First, fetch products from DB to have data to cache
			const dbStartTime = performance.now();
			const products = await ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
				},
				where: isNull(ProductsTable.deletedAt),
				limit: 5,
				with: {
					images: {
						columns: {
							url: true,
						},
						where: isNull(ProductImagesTable.deletedAt),
					},
				},
			});
			const dbElapsed = performance.now() - dbStartTime;

			const product = products.map((p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				price: p.price,
				images: p.images.map((img) => ({ url: img.url })),
			}));

			// Measure KV write time
			const kvWriteStartTime = performance.now();
			await ctx.kv.put(cacheKey, JSON.stringify(product), {
				expirationTtl: 3600, // 1 hour
			});
			const kvWriteElapsed = performance.now() - kvWriteStartTime;

			// Measure KV read time
			const kvReadStartTime = performance.now();
			const cached = await ctx.kv.get(cacheKey);
			const kvReadElapsed = performance.now() - kvReadStartTime;

			const kvReadProduct = cached ? JSON.parse(cached) : null;

			return {
				dbElapsed,
				kvWriteElapsed,
				kvReadElapsed,
				product: kvReadProduct || product,
			};
		} catch (error) {
			console.error("Error in benchmark:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run benchmark",
				cause: error,
			});
		}
	}),
	getInfiniteProducts: publicProcedure
		.input(
			v.object({
				cursor: v.optional(v.string()),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.number(), 0),
				categoryId: v.optional(v.number(), 0),
				searchTerm: v.optional(v.string()),
				sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				const q = createQueries(ctx.db).products.store;

				const products = await q.getInfiniteProducts(input);
				return products;
			} catch (error) {
				console.error("Error in getInfiniteProducts:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get infinite products",
					cause: error,
				});
			}
		}),
});
