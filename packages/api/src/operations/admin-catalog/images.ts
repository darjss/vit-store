import {
	adminMutationSuccessSchema,
	catalogMutationErrorSchema,
	uploadErrorSchema,
	type UploadError,
} from "@vit/shared";
import { Result } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import {
	addImage,
	deleteImage,
	setPrimaryImage,
} from "~/operations/admin-catalog/entities";
import {
	catalogResourceNotFound,
	uploadImageFetchFailed,
	uploadStorageUnavailable,
} from "~/errors/factories/admin";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import type { Context } from "~/lib/context";
import { productImageQueries } from "~/queries/product-images";
import { productQueries } from "~/queries/products";
import type { LegacyTrpcError } from "~/result/legacy-trpc";

export const uploadMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: uploadErrorSchema,
};

export const imageMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: catalogMutationErrorSchema,
};

export const addProductImage = async (
	ctx: Context,
	input: { productId: number; url: string; isPrimary: boolean },
) => {
	const result = await addImage(input);
	if (result.status === "error") return result;
	await purgeCatalogCache(ctx, [input.productId]);
	return result;
};

export const deleteProductImage = async (ctx: Context, id: number) => {
	const image = await productImageQueries.admin.getImageById(id);
	const result = await deleteImage(id);
	if (result.status === "error") return result;
	if (image) await purgeCatalogCache(ctx, [image.productId]);
	return Result.ok({ message: "Successfully deleted image" });
};

export const setPrimaryProductImage = async (
	ctx: Context,
	input: { productId: number; imageId: number },
) => {
	const result = await setPrimaryImage(input);
	if (result.status === "error") return result;
	await purgeCatalogCache(ctx, [input.productId]);
	return result;
};

export const updateProductImages = async (
	ctx: Context,
	input: { productId: number; newImages: Array<{ url: string }> },
) => {
	const product = await productQueries.admin.getProductById(input.productId);
	if (!product) {
		return Result.err(catalogResourceNotFound("product", input.productId));
	}
	const existingImages = await productImageQueries.admin.getImagesByProductId(
		input.productId,
	);
	const nextUrls = input.newImages.map((image) => image.url).toSorted();
	const currentUrls = existingImages.map((image) => image.url).toSorted();
	const changed =
		nextUrls.length !== currentUrls.length ||
		nextUrls.some((url, index) => url !== currentUrls[index]);

	if (changed) {
		await productImageQueries.admin.softDeleteImagesByProductId(
			input.productId,
		);
		if (input.newImages.length > 0) {
			await productImageQueries.admin.createImages(
				input.newImages.map((image, index) => ({
					productId: input.productId,
					url: image.url,
					isPrimary: index === 0,
				})),
			);
		}
		await purgeCatalogCache(ctx, [input.productId]);
	}
	return Result.ok({ message: "Successfully updated images" });
};

const uploadedImagesResponseSchema = v.strictObject({
	images: v.array(v.strictObject({ url: v.pipe(v.string(), v.url()) })),
	status: v.string(),
	time: v.number(),
});

export const uploadErrorToLegacyTrpc = (error: UploadError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		ImageRequired: () => ({ code: "BAD_REQUEST", message: "Image required" }),
		UnsupportedImageType: () => ({
			code: "BAD_REQUEST",
			message: "Unsupported image type",
		}),
		ImageTooLarge: () => ({
			code: "PAYLOAD_TOO_LARGE",
			message: "Image too large",
		}),
		TooManyImages: () => ({ code: "BAD_REQUEST", message: "Too many images" }),
		ImageFetchFailed: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Operation failed",
		}),
		ImageTransformFailed: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Operation failed",
		}),
		StorageUnavailable: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Operation failed",
		}),
	});

export const uploadProductImagesFromUrls = async (
	ctx: Context,
	input: {
		images: Array<{ productId: number; url: string; isPrimary: boolean }>;
	},
) => {
	const imageUploadToken = ctx.c.env.IMAGE_UPLOAD_TOKEN;
	if (!imageUploadToken) {
		return Result.err(uploadStorageUnavailable(false));
	}

	let response: Response;
	try {
		response = await fetch(`${process.env.BACKEND_URL}/upload/images/urls`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Image-Upload-Token": imageUploadToken,
			},
			body: JSON.stringify(input.images.map((image) => ({ url: image.url }))),
		});
	} catch {
		return Result.err(uploadImageFetchFailed(0, true));
	}

	if (!response.ok) {
		return Result.err(uploadStorageUnavailable(response.status >= 500));
	}

	const parsed = v.safeParse(
		uploadedImagesResponseSchema,
		await response.json(),
	);
	if (!parsed.success || parsed.output.images.length !== input.images.length) {
		throw new TypeError("Image upload provider returned an invalid response");
	}

	const imagesToInsert = parsed.output.images.map((uploadedImage, index) => {
		const source = input.images[index];
		if (!source) throw new TypeError("Image upload response index mismatch");
		return { ...source, url: uploadedImage.url };
	});
	await productImageQueries.admin.createImages(imagesToInsert);
	await purgeCatalogCache(ctx, [
		...new Set(imagesToInsert.map((image) => image.productId)),
	]);
	return Result.ok({ message: "Successfully uploaded images" });
};
