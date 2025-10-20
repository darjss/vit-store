import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { ProductImagesTable } from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";

export const image = router({
	addImage: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				url: v.pipe(v.string(), v.url()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { productId, url } = input;
				const image = await ctx.db.insert(ProductImagesTable).values({
					productId,
					url,
				});
				return image;
			} catch (error) {
				console.error("Error adding image:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),
	deleteImage: adminProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id } = input;
				await ctx.db
					.delete(ProductImagesTable)
					.where(eq(ProductImagesTable.id, id));
				return { message: "Image deleted successfully" };
			} catch (error) {
				console.error("Error deleting image:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),
	setPrimaryImage: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				imageId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { productId, imageId } = input;
				await ctx.db
					.update(ProductImagesTable)
					.set({ isPrimary: false })
					.where(eq(ProductImagesTable.productId, productId));
				await ctx.db
					.update(ProductImagesTable)
					.set({ isPrimary: true })
					.where(eq(ProductImagesTable.id, imageId));
				return { message: "Successfully set primary image" };
			} catch (error) {
				console.error("Error setting primary image:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),
});
