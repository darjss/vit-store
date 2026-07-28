import { TRPCError } from "@trpc/server";
import * as v from "valibot";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addProductImage,
	catalogErrorToLegacyTrpc,
	deleteProductImage,
	imageMutationResultSchemas,
	setPrimaryProductImage,
	updateProductImages,
	uploadErrorToLegacyTrpc,
	uploadMutationResultSchemas,
	uploadProductImagesFromUrls,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { productImageQueries } from "~/queries/product-images";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const productId = v.pipe(v.number(), v.integer(), v.minValue(1));
const imageId = v.pipe(v.number(), v.integer(), v.minValue(1));
const imageInputSchema = v.object({
	productId,
	url: v.pipe(v.string(), v.url()),
	isPrimary: v.boolean(),
});
const uploadImagesInputSchema = v.object({ images: v.array(imageInputSchema) });
const updateImagesInputSchema = v.object({
	newImages: v.array(v.object({ url: v.pipe(v.string(), v.url()) })),
	productId,
});
const productIdInputSchema = v.object({ productId });
const imageIdInputSchema = v.object({ id: imageId });
const setPrimaryInputSchema = v.object({ productId, imageId });

export function buildProductImagesRouter<P extends typeof baseProcedure>(
	proc: P,
) {
	return router({
		addImage: proc
			.input(imageInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addImage",
					"Operation failed",
					() => addProductImage(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		uploadImagesFromUrl: proc
			.input(uploadImagesInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"uploadImagesFromUrl",
					"Operation failed",
					() => uploadProductImagesFromUrls(ctx, input),
					uploadErrorToLegacyTrpc,
				),
			),
		updateImage: proc
			.input(updateImagesInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateImage",
					"Operation failed",
					() => updateProductImages(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		getImagesByProductId: proc
			.input(productIdInputSchema)
			.query(async ({ ctx, input }) => {
				try {
					return await productImageQueries.admin.getImagesByProductId(
						input.productId,
					);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "getImagesByProductId" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Operation failed",
						cause: error,
					});
				}
			}),
		deleteImage: proc
			.input(imageIdInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deleteImage",
					"Operation failed",
					() => deleteProductImage(ctx, input.id),
					catalogErrorToLegacyTrpc,
				),
			),
		setPrimaryImage: proc
			.input(setPrimaryInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"setPrimaryImage",
					"Operation failed",
					() => setPrimaryProductImage(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		getAllImages: proc.query(async ({ ctx }) => {
			try {
				return await productImageQueries.admin.getAllImages();
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getAllImages",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),
	});
}

export const productImagesV2 = router({
	addImage: adminProcedure
		.input(imageInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addProductImage(ctx, input),
				imageMutationResultSchemas,
				{ operation: "admin.product_image.add", error_layer: "domain" },
			),
		),
	uploadImagesFromUrl: adminProcedure
		.input(uploadImagesInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await uploadProductImagesFromUrls(ctx, input),
				uploadMutationResultSchemas,
				{ operation: "admin.product_image.upload", error_layer: "adapter" },
			),
		),
	updateImage: adminProcedure
		.input(updateImagesInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateProductImages(ctx, input),
				imageMutationResultSchemas,
				{ operation: "admin.product_image.update", error_layer: "domain" },
			),
		),
	deleteImage: adminProcedure
		.input(imageIdInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteProductImage(ctx, input.id),
				imageMutationResultSchemas,
				{ operation: "admin.product_image.delete", error_layer: "domain" },
			),
		),
	setPrimaryImage: adminProcedure
		.input(setPrimaryInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await setPrimaryProductImage(ctx, input),
				imageMutationResultSchemas,
				{ operation: "admin.product_image.set_primary", error_layer: "domain" },
			),
		),
});

export const productImages = buildProductImagesRouter(adminProcedure);
export const productImagesBot = buildProductImagesRouter(botProcedure);
