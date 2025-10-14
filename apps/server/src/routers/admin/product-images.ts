import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ProductImagesTable } from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";

export const productImages = router({
	addImage: adminProcedure
		.input(
			z.object({
				productId: z.number(),
				url: z.url("Invalid URL format"),
				isPrimary: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.insert(ProductImagesTable).values(input);
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
			z.object({
				images: z.array(
					z.object({
						productId: z.number(),
						url: z.string().url("Invalid URL format"),
						isPrimary: z.boolean().default(false),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
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

				const addImagePromises = uploadedImages.images.map(
					(uploadedImage, index) => {
						return ctx.db.insert(ProductImagesTable).values({
							...input.images[index],
							url: uploadedImage.url,
						});
					},
				);

				await Promise.all(addImagePromises);
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
			z.object({
				newImages: z.array(
					z.object({
						url: z.string().url("Invalid URL format"),
					}),
				),
				productId: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { newImages, productId } = input;

				const existingImages = await ctx.db
					.select({
						id: ProductImagesTable.id,
						url: ProductImagesTable.url,
					})
					.from(ProductImagesTable)
					.where(
						and(
							eq(ProductImagesTable.productId, productId),
							isNull(ProductImagesTable.deletedAt),
						),
					);

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
					const deletePromises = existingImages.map((image) =>
						ctx.db
							.update(ProductImagesTable)
							.set({ deletedAt: new Date() })
							.where(
								and(
									eq(ProductImagesTable.id, image.id),
									isNull(ProductImagesTable.deletedAt),
								),
							),
					);
					await Promise.allSettled(deletePromises);

					// Insert new images
					const insertPromises = newImages.map((image, index) =>
						ctx.db.insert(ProductImagesTable).values({
							productId: productId,
							url: image.url,
							isPrimary: index === 0,
						}),
					);
					await Promise.allSettled(insertPromises);
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
			z.object({
				productId: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { productId } = input;
				const images = await ctx.db
					.select({
						id: ProductImagesTable.id,
						productId: ProductImagesTable.productId,
						url: ProductImagesTable.url,
						isPrimary: ProductImagesTable.isPrimary,
						createdAt: ProductImagesTable.createdAt,
					})
					.from(ProductImagesTable)
					.where(and(eq(ProductImagesTable.productId, productId),isNull(ProductImagesTable.deletedAt)))
					.orderBy(ProductImagesTable.isPrimary);

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
			z.object({
				id: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id } = input;
				await ctx.db
					.update(ProductImagesTable)
					.set({ deletedAt: new Date() })
					.where(
						and(
							eq(ProductImagesTable.id, id),
							isNull(ProductImagesTable.deletedAt),
						),
					);

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
			z.object({
				productId: z.number(),
				imageId: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { productId, imageId } = input;

				await ctx.db
					.update(ProductImagesTable)
					.set({ isPrimary: false })
					.where(
						and(
							eq(ProductImagesTable.productId, productId),
							isNull(ProductImagesTable.deletedAt),
						),
					);

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

	getAllImages: adminProcedure.query(async ({ ctx }) => {
		try {
			const images = await ctx.db
				.select({
					id: ProductImagesTable.id,
					productId: ProductImagesTable.productId,
					url: ProductImagesTable.url,
					isPrimary: ProductImagesTable.isPrimary,
					createdAt: ProductImagesTable.createdAt,
				})
				.from(ProductImagesTable)
				.orderBy(ProductImagesTable.createdAt);

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
