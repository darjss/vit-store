import { TRPCError } from "@trpc/server";
import { createQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const productImages = router({
	addImage: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				url: v.pipe(v.string(), v.url()),
				isPrimary: v.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).productImages.admin;
				await q.createImage(input);
				return { message: "Successfully added image" };
			} catch (error) {
				console.error("Error adding image:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),

	uploadImagesFromUrl: adminProcedure
		.input(
			v.object({
				images: v.array(
					v.object({
						productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
						url: v.pipe(v.string(), v.url()),
						isPrimary: v.boolean(),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).productImages.admin;
				const imageUrls = input.images.map((image) => ({ url: image.url }));

				const response = await fetch(
					`${process.env.BACKEND_URL}/upload/image/urls`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(imageUrls),
					},
				);

				console.log(response.body);
				if (!response.ok) {
					const errorText = await response.text();
					console.error(
						"Image upload failed:",
						response.status,
						response.statusText,
						errorText,
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Image upload failed: ${response.status} ${response.statusText} ${errorText}`,
						cause: errorText,
					});
				}

				const uploadedImages = (await response.json()) as {
					images: { url: string }[];
					status: string;
					time: number;
				};

				const imagesToInsert = uploadedImages.images.map(
					(uploadedImage, index) => ({
						...input.images[index],
						url: uploadedImage.url,
					}),
				);

				await q.createImages(imagesToInsert);
				return { message: "Successfully uploaded images" };
			} catch (error) {
				console.error("Error in uploadImagesFromUrl:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),

	updateImage: adminProcedure
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
				const q = createQueries(ctx.db).productImages.admin;
				const { newImages, productId } = input;

				const existingImages = await q.getImagesByProductId(productId);

				console.log("existing", existingImages);
				console.log("updated", newImages);

				let isDiff = false;
				if (newImages.length !== existingImages.length) {
					isDiff = true;
				} else {
					const sortedNewImages = newImages.toSorted((a, b) =>
						a.url.localeCompare(b.url),
					);
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
					await q.softDeleteImagesByProductId(productId);

					// Insert new images
					const imagesToInsert = newImages.map((image, index) => ({
						productId: productId,
						url: image.url,
						isPrimary: index === 0,
					}));
					await q.createImages(imagesToInsert);
				}

				return { message: "Successfully updated images" };
			} catch (error) {
				console.error("Error updating images:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Operation failed",
					cause: error,
				});
			}
		}),

	getImagesByProductId: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).productImages.admin;
				const { productId } = input;
				const images = await q.getImagesByProductId(productId);
				return images;
			} catch (error) {
				console.error("Error getting images by product ID:", error);
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
				const q = createQueries(ctx.db).productImages.admin;
				const { id } = input;
				await q.deleteImage(id);
				return { message: "Successfully deleted image" };
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
				const q = createQueries(ctx.db).productImages.admin;
				const { productId, imageId } = input;
				await q.setPrimaryImage(productId, imageId);
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

	getAllImages: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = createQueries(ctx.db).productImages.admin;
			const images = await q.getAllImages();
			return images;
		} catch (error) {
			console.error("Error getting all images:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Operation failed",
				cause: error,
			});
		}
	}),
});
