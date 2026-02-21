import { TRPCError } from "@trpc/server";
import { productImageQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

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
				await productImageQueries.admin.createImage({ productId, url });
				return { message: "Successfully added image" };
			} catch (error) {
				ctx.log.error("addImage", error);
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
				await productImageQueries.admin.deleteImage(id);
				return { message: "Image deleted successfully" };
			} catch (error) {
				ctx.log.error("deleteImage", error);
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
				await productImageQueries.admin.setPrimaryImage(productId, imageId);
				return { message: "Successfully set primary image" };
			} catch (error) {
				ctx.log.error("setPrimaryImage", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),
});
