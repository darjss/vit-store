import { TRPCError } from "@trpc/server";
import { storeQueries } from "@vit/api/queries";
import * as v from "valibot";
import { publicProcedure, router } from "../../lib/trpc";

export const product = router({
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					storeQueries.getFeaturedProducts(),
					storeQueries.getNewProducts(),
					storeQueries.getDiscountedProducts(),
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
		return await storeQueries.getAllProducts();
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const result = await storeQueries.getProductById(input.id);
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
			const result = await storeQueries.getProductsByIds(input.ids);
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
				const [sameCategory, sameBrand] = await Promise.all([
					storeQueries.getRecommendedProductsByCategory(
						input.categoryId,
						input.productId,
					),
					storeQueries.getRecommendedProductsByBrand(
						input.brandId,
						input.productId,
					),
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
			const product = await storeQueries.getProductStockStatus(
				input.productId,
			);
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
			const product = await storeQueries.getProductBenchmark(10);
			return { dbElapsed: performance.now() - startTime, product };
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
