import { TRPCError } from "@trpc/server";
import { productImageQueries } from "@vit/api/queries";
import * as v from "valibot";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { DEFAULT_PRODUCT_IMAGE_PREFIX, uploadImageUrls } from "~/lib/product-image-upload";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";

export function buildProductImagesRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addImage: proc
			.input(
				v.object({
					isPrimary: v.boolean(),
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
					url: v.pipe(v.string(), v.url()),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					await productImageQueries.admin.createImage(input);
					await purgeCatalogCache(ctx, [input.productId]);
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
					const image = await productImageQueries.admin.getImageById(id);
					await productImageQueries.admin.deleteImage(id);
					if (image) {
						await purgeCatalogCache(ctx, [image.productId]);
					}
					return { message: "Successfully deleted image" };
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
		getAllImages: proc.query(async ({ ctx }) => {
			try {
				const images = await productImageQueries.admin.getAllImages();
				return images;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getAllImages",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
				});
			}
		}),
		getImagesByProductId: proc
			.input(
				v.object({
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const { productId } = input;
					const images = await productImageQueries.admin.getImagesByProductId(productId);
					return images;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getImagesByProductId",
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
					await purgeCatalogCache(ctx, [productId]);
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
		updateImage: proc
			.input(
				v.object({
					newImages: v.array(
						v.object({
							url: v.pipe(v.string(), v.url()),
						}),
					),
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const { newImages, productId } = input;
					const existingImages = await productImageQueries.admin.getImagesByProductId(productId);
					let isDiff = false;
					if (newImages.length !== existingImages.length) {
						isDiff = true;
					} else {
						const sortedNewImages = newImages.toSorted((a, b) => a.url.localeCompare(b.url));
						const sortedExistingImages = existingImages.toSorted((a, b) =>
							a.url.localeCompare(b.url),
						);
						for (let i = 0; i < newImages.length; i++) {
							if (sortedNewImages[i]?.url !== sortedExistingImages[i]?.url) {
								isDiff = true;
								break;
							}
						}
					}
					if (isDiff) {
						// Delete existing images
						await productImageQueries.admin.softDeleteImagesByProductId(productId);
						// Insert new images
						const imagesToInsert = newImages.map((image, index) => ({
							isPrimary: index === 0,
							productId,
							url: image.url,
						}));
						await productImageQueries.admin.createImages(imagesToInsert);
						await purgeCatalogCache(ctx, [productId]);
					}
					return { message: "Successfully updated images" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "updateImage",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Operation failed",
					});
				}
			}),
		uploadImagesFromUrl: proc
			.input(
				v.object({
					images: v.array(
						v.object({
							isPrimary: v.boolean(),
							productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
							url: v.pipe(v.string(), v.url()),
						}),
					),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const results = await uploadImageUrls(
					ctx.c.env,
					ctx.log,
					DEFAULT_PRODUCT_IMAGE_PREFIX,
					input.images.map((image) => image.url),
				);
				const failed = results.filter((result) => !result.ok);
				if (failed.length > 0) {
					// All or nothing, so a remote URL never lands in the table and the primary flag stays put.
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Could not copy ${failed.length} of ${results.length} images to the CDN, nothing saved: ${failed
							.map((result) => `${result.sourceUrl} (${result.error})`)
							.join("; ")}`,
					});
				}
				const imagesToInsert = results.flatMap((result, index) =>
					result.ok ? [{ ...input.images[index], url: result.url }] : [],
				);
				try {
					await productImageQueries.admin.createImages(imagesToInsert);
					await purgeCatalogCache(ctx, [
						...new Set(imagesToInsert.map((image) => image.productId)),
					]);
					return { message: "Successfully uploaded images" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "uploadImagesFromUrl",
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
export const productImages = buildProductImagesRouter(adminProcedure);
export const productImagesBot = buildProductImagesRouter(botProcedure);
