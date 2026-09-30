import { TRPCError } from "@trpc/server";
import { productImageQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
export function buildImageRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addImage: proc
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
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "addImage",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Operation failed",
					});
				}
			}),
		deleteImage: proc
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
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "deleteImage",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Operation failed",
					});
				}
			}),
		setPrimaryImage: proc
			.input(
				v.object({
					imageId: v.pipe(v.number(), v.integer(), v.minValue(1)),
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const { imageId, productId } = input;
					await productImageQueries.admin.setPrimaryImage(productId, imageId);
					return { message: "Successfully set primary image" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "setPrimaryImage",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Operation failed",
					});
				}
			}),
	});
}
export const image = buildImageRouter(adminProcedure);
export const imageBot = buildImageRouter(botProcedure);
