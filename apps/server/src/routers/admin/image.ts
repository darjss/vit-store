import { TRPCError } from "@trpc/server";
import { octetInputParser } from '@trpc/server/http';
import { nanoid } from "nanoid";
import { z } from "zod";
import { adminProcedure, router } from "@/lib/trpc";

export const image = router({
	upload: adminProcedure
		.input(
			z.object({

				image: octetInputParser, // Temporarily change this to see what we're getting
				productId: z.number().optional(),
				brandId: z.number().optional(),
				category: z.enum(["product", "brand"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const { image, productId, brandId, category } = input;
				console.log("image upload started");
				console.log("typeof image:", typeof image);
				console.log("image constructor:", image?.constructor?.name);
				console.log("image instanceof File:", image instanceof File);
				console.log("image keys:", Object.keys(image || {}));
				console.log("image.type", image?.type);3
				console.log("image upload started");
				console.log("image.type", image.type);
				if (!image.type.startsWith("image/")) {
					console.error("Invalid image type", image.type);
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid image type",
					});
				}
				if (image.size > 10 * 1024 * 1024) {
					console.error("Image size is too large", image.size);
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Image size is too large",
					});
				}
				const id = productId || brandId;
				const key = `${category}/${id}/${nanoid()}.${image.type.split("/")[1]}`;
				await ctx.r2.put(key, image, {
					httpMetadata: {
						contentType: image.type,
					},
				});
				const url = `https://pub-b7dba2c2817f4a82971b1c3a86e3dafa.r2.dev/${key}`;
				return url;
			} catch (error) {
				console.error("Error uploading image:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload image",
				});
			}
		}),
		getSignedUrl: adminProcedure.
						input(z.object({
							fileName: z.string(),
							productId: z.number().optional(),
							brandId: z.number().optional(),
							category: z.enum(["product", "brand"]),
						}))
						.query(async ({ input, ctx }) => {
							const { productId, brandId, category } = input;
							const id = productId || brandId;
							const extension = input.fileName.split(".").pop();
							const key = `${category}/${id}/${nanoid()}.${extension}`;
				
							return key;
						})
});
