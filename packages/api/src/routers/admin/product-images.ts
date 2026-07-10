import { TRPCError } from "@trpc/server";
import { productImageQueries } from "@vit/api/queries";
import * as v from "valibot";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
export function buildProductImagesRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    addImage: proc
        .input(v.object({
        productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
        url: v.pipe(v.string(), v.url()),
        isPrimary: v.boolean(),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            await productImageQueries.admin.createImage(input);
            await purgeCatalogCache(ctx, [input.productId]);
            return { message: "Successfully added image" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "addImage"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    uploadImagesFromUrl: proc
        .input(v.object({
        images: v.array(v.object({
            productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
            url: v.pipe(v.string(), v.url()),
            isPrimary: v.boolean(),
        })),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const imageUrls = input.images.map((image) => ({ url: image.url }));
            const response = await fetch(`${process.env.BACKEND_URL}/upload/images/urls`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(imageUrls),
            });
            if (!response.ok) {
                const errorText = await response.text();
                ctx.log.error("uploadImagesFromUrl", {
                    event: "uploadImagesFromUrl",
                    status: response.status,
                    statusText: response.statusText,
                    errorText
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Image upload failed: ${response.status} ${response.statusText} ${errorText}`,
                    cause: errorText,
                });
            }
            const uploadedImages = (await response.json()) as {
                images: {
                    url: string;
                }[];
                status: string;
                time: number;
            };
            const imagesToInsert = uploadedImages.images.map((uploadedImage, index) => ({
                ...input.images[index],
                url: uploadedImage.url,
            }));
            await productImageQueries.admin.createImages(imagesToInsert);
            await purgeCatalogCache(
                ctx,
                [...new Set(imagesToInsert.map((image) => image.productId))],
            );
            return { message: "Successfully uploaded images" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "uploadImagesFromUrl"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    updateImage: proc
        .input(v.object({
        newImages: v.array(v.object({
            url: v.pipe(v.string(), v.url()),
        })),
        productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const { newImages, productId } = input;
            const existingImages = await productImageQueries.admin.getImagesByProductId(productId);
            let isDiff = false;
            if (newImages.length !== existingImages.length) {
                isDiff = true;
            }
            else {
                const sortedNewImages = newImages.toSorted((a, b) => a.url.localeCompare(b.url));
                const sortedExistingImages = existingImages.toSorted((a, b) => a.url.localeCompare(b.url));
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
                    productId: productId,
                    url: image.url,
                    isPrimary: index === 0,
                }));
                await productImageQueries.admin.createImages(imagesToInsert);
                await purgeCatalogCache(ctx, [productId]);
            }
            return { message: "Successfully updated images" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "updateImage"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    getImagesByProductId: proc
        .input(v.object({
        productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const { productId } = input;
            const images = await productImageQueries.admin.getImagesByProductId(productId);
            return images;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getImagesByProductId"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    deleteImage: proc
        .input(v.object({
        id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const { id } = input;
            const image = await productImageQueries.admin.getImageById(id);
            await productImageQueries.admin.deleteImage(id);
            if (image) await purgeCatalogCache(ctx, [image.productId]);
            return { message: "Successfully deleted image" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "deleteImage"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    setPrimaryImage: proc
        .input(v.object({
        productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
        imageId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const { productId, imageId } = input;
            await productImageQueries.admin.setPrimaryImage(productId, imageId);
            await purgeCatalogCache(ctx, [productId]);
            return { message: "Successfully set primary image" };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "setPrimaryImage"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
    getAllImages: proc.query(async ({ ctx }) => {
        try {
            const images = await productImageQueries.admin.getAllImages();
            return images;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAllImages"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Operation failed",
                cause: error,
            });
        }
    }),
});
}
export const productImages = buildProductImagesRouter(adminProcedure);
export const productImagesBot = buildProductImagesRouter(botProcedure);
