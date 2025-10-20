import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as v from "valibot";
import { ProductImagesTable, ProductsTable } from "@/db/schema";
import { publicProcedure, router } from "@/lib/trpc";

export const product = router({
	getFeauturedProducts: publicProcedure.query(async ({ ctx }) => {
		const result = await ctx.db.query.ProductsTable.findMany({
			columns: {
				id: true,
				name: true,
				price: true,
			},
			orderBy: sql`RANDOM()`,
			limit: 10,
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
			},
		});
		return result.map((product) => ({
			id: product.id,
			name: product.name,
			price: product.price,
			image: product.images[0]?.url,
		}));
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
