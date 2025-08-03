import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
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
			where: eq(ProductsTable.status, "active"),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: eq(ProductImagesTable.isPrimary, true),
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
		});
	}),
	getProductById: publicProcedure
		.input(
			z.object({
				id: z.number(),
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
				where: eq(ProductsTable.id, input.id),
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
			z.object({
				ids: z.array(z.number()),
			}),
		)
		.query(async ({ input, ctx }) => {
			const result = await ctx.db.query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				where: inArray(ProductsTable.id, input.ids),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: eq(ProductImagesTable.isPrimary, true),
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
	//         .input(z.object({
	//             id: z.number(),
	//         }))
});
