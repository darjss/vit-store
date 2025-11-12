import { TRPCError } from "@trpc/server";
import { storeQueries } from "@vit/api/queries";
import { isNull } from "drizzle-orm";
import * as v from "valibot";
import { ProductImagesTable, ProductsTable } from "../../db/schema";
import { publicProcedure, router } from "../../lib/trpc";

export const product = router({
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = storeQueries(ctx.db);
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
		const q = storeQueries(ctx.db);
		return await q.getAllProducts();
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const q = storeQueries(ctx.db);
			const result = await q.getProductById(input.id);
			if (result === null || result === undefined) {
				return null;
			}
			result.images = result.images.map((image) => ({
				url: image.url,
				isPrimary: image.isPrimary,
			}));
			return result;
		}),
	getProductsByIds: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input, ctx }) => {
			const q = storeQueries(ctx.db);
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
				const q = storeQueries(ctx.db);
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
			const q = storeQueries(ctx.db);
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
			const startTime = performance.now();

			// Query products with images using Drizzle ORM
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

			const dbElapsed = performance.now() - startTime;

			// Transform to match expected format
			const product = products.map((p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				price: p.price,
				images: p.images.map((img) => ({ url: img.url })),
			}));

			return {
				dbElapsed,
				product,
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
});
