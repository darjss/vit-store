import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import * as v from "valibot";
import { ProductImagesTable, ProductsTable } from "../../db/schema";
import { publicProcedure, router } from "../../lib/trpc";

export const product = router({
	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const featuredProductsPromise = ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				orderBy: asc(ProductsTable.updatedAt),
				limit: 4,
				where: and(
					eq(ProductsTable.isFeatured, true),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
			const newProductsPromise = ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				orderBy: desc(ProductsTable.updatedAt),
				limit: 4,
				where: and(
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
			const discountedProductsPromise = ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
					discount: true,
				},
				orderBy: desc(ProductsTable.updatedAt),
				limit: 4,
				where: and(
					gt(ProductsTable.discount, 0),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					featuredProductsPromise,
					newProductsPromise,
					discountedProductsPromise,
				]);
			return {
				featuredProducts: featuredProducts.map((product) => ({
					id: product.id,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
				})),
				newProducts: newProducts.map((product) => ({
					id: product.id,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
				})),
				discountedProducts: discountedProducts.map((product) => ({
					id: product.id,
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
		return await ctx.db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
			},
			where: isNull(ProductsTable.deletedAt),
		});
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const result = await ctx.db.query.ProductsTable.findFirst({
				columns: {
					id: true,
					name: true,
					price: true,
					status: true,
					description: true,
					discount: true,
					amount: true,
					potency: true,
					dailyIntake: true,
					categoryId: true,
					brandId: true,
				},
				where: and(
					eq(ProductsTable.id, input.id),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
							isPrimary: true,
						},
					},
				},
			});
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
			const result = await ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				where: and(
					inArray(ProductsTable.id, input.ids),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
				},
			});
			return result.map((product) => ({
				id: product.id,
				name: product.name,
				price: product.price,
				image: product.images[0]?.url,
			}));
		}),
	//     getProductStock: publicProcedure
	//         .input(v.object({
	//             id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	//         }))
});
