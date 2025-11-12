import { TRPCError } from "@trpc/server";
import { addProductSchema, updateProductSchema } from "@vit/shared";
import { adminQueries } from "@vit/api/queries";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, productFields } from "../../lib/constants";
import { adminProcedure, router } from "../../lib/trpc";

export const product = router({
	searchProductByName: adminProcedure
		.input(v.object({ searchTerm: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const products = await q.searchByName(input.searchTerm, 3);
				return products;
			} catch (error) {
				console.error("Error searching products:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	searchProductByNameForOrder: adminProcedure
		.input(v.object({ searchTerm: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const products = await q.searchByNameForOrder(input.searchTerm, 3);
				return products;
			} catch (error) {
				console.error("Error searching products for order:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products for order",
					cause: error,
				});
			}
		}),

	addProduct: adminProcedure
		.input(addProductSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				// Remove the last empty image if present
				const images = input.images.filter((image) => image.url.trim() !== "");
				// Validate image URLs
				for (const image of images) {
					const result = v.safeParse(v.pipe(v.string(), v.url()), image.url);
					if (!result.success) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Invalid image URL: ${image.url}`,
						});
					}
				}
				const brand = await q.getBrandById(input.brandId);
				if (!brand) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				}
				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();
				const productResult = await q.createProduct({
					name: productName,
					slug,
					description: input.description,
					discount: 0,
					amount: input.amount,
					potency: input.potency,
					stock: input.stock,
					price: input.price,
					dailyIntake: input.dailyIntake,
					categoryId: input.categoryId,
					brandId: input.brandId,
					status: "active",
				});
				if (!productResult) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create product",
					});
				}
				const productId = productResult.id;
				const imagesToInsert = images.map((image, index) => ({
					productId: productId,
					url: image.url,
					isPrimary: index === 0,
				}));
				await q.createProductImages(productId, imagesToInsert);
				return { message: "Product added successfully" };
			} catch (error) {
				console.error("Error adding product:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add product",
					cause: error,
				});
			}
		}),

	getProductBenchmark: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = adminQueries(ctx.db);
			const startTime = performance.now();
			await q.getProductBenchmark();
			return performance.now() - startTime;
		} catch (error) {
			console.error("Error in benchmark:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run benchmark",
				cause: error,
			});
		}
	}),

	getProductById: adminProcedure
		.input(v.object({ id: v.number() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const product = await q.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				return product;
			} catch (error) {
				console.error("Error fetching product:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch product",
					cause: error,
				});
			}
		}),

	updateProduct: adminProcedure
		.input(updateProductSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				if (!input.id)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Product ID is required",
					});
				const { images, ...productData } = input;
				const filteredImages = images.filter(
					(image) => image.url.trim() !== "",
				);
				for (const image of filteredImages) {
					const result = v.safeParse(v.pipe(v.string(), v.url()), image.url);
					if (!result.success)
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Invalid image URL",
						});
				}
				const brand = await q.getBrandById(input.brandId);
				if (!brand)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();
				await q.updateProduct(input.id, {
					...productData,
					name: productName,
					slug,
				});
				const existingImages = await q.getProductImages(input.id);
				let isDiff = false;
				if (filteredImages.length !== existingImages.length) {
					isDiff = true;
				} else {
					const sortedNewImages = filteredImages.toSorted((a, b) =>
						a.url.localeCompare(b.url),
					);
					const sortedExistingImages = existingImages.toSorted((a, b) =>
						a.url.localeCompare(b.url),
					);
					for (let i = 0; i < filteredImages.length; i++) {
						if (sortedNewImages[i]?.url !== sortedExistingImages[i]?.url) {
							isDiff = true;
							break;
						}
					}
				}
				if (isDiff) {
					await q.softDeleteProductImages(input.id);
					const imagesToInsert = filteredImages.map((image, index) => ({
						productId: input.id,
						url: image.url,
						isPrimary: index === 0,
					}));
					await q.createProductImages(input.id, imagesToInsert);
				}
				return { message: "Product updated successfully" };
			} catch (error) {
				console.error("Error updating product:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update product",
					cause: error,
				});
			}
		}),

	updateStock: adminProcedure
		.input(
			v.object({
				productId: v.number(),
				numberToUpdate: v.number(),
				type: v.picklist(["add", "minus"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const product = await q.getProductById(input.productId);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await q.updateStock(
					input.productId,
					input.numberToUpdate,
					input.type,
				);
				return { message: "Stock updated successfully" };
			} catch (error) {
				console.error("Error updating stock:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update stock",
					cause: error,
				});
			}
		}),

	deleteProduct: adminProcedure
		.input(v.object({ id: v.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const product = await q.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await q.deleteProduct(input.id);
				return { message: "Product deleted successfully" };
			} catch (error) {
				console.error("Error deleting product:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete product",
					cause: error,
				});
			}
		}),

	getAllProducts: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = adminQueries(ctx.db);
			const products = await q.getAllProducts();
			return products;
		} catch (error) {
			console.error("Error fetching all products:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch products",
				cause: error,
			});
		}
	}),

	getPaginatedProducts: adminProcedure
		.input(
			v.object({
				page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
				pageSize: v.optional(
					v.pipe(v.number(), v.integer(), v.minValue(1)),
					PRODUCT_PER_PAGE,
				),
				brandId: v.optional(v.number()),
				categoryId: v.optional(v.number()),
				sortField: v.optional(v.string()),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
				searchTerm: v.optional(v.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				return await q.getPaginatedProducts({
					page: input.page ?? 1,
					pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
					brandId: input.brandId,
					categoryId: input.categoryId,
					sortField: input.sortField,
					sortDirection: input.sortDirection ?? "desc",
					searchTerm: input.searchTerm,
				});
			} catch (error) {
				console.error("Error fetching paginated products:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch paginated products",
					cause: error,
				});
			}
		}),

	setProductStock: adminProcedure
		.input(v.object({ id: v.number(), newStock: v.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const product = await q.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await q.setProductStock(input.id, input.newStock);
				return { message: "Stock set successfully" };
			} catch (error) {
				console.error("Error setting product stock:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to set product stock",
					cause: error,
				});
			}
		}),

	getAllProductValue: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = adminQueries(ctx.db);
			const result = await q.getAllProductValue();
			return result;
		} catch (error) {
			console.error("Error calculating product value:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to calculate product value",
				cause: error,
			});
		}
	}),
	updateProductField: adminProcedure
		.input(
			v.object({
				id: v.number(),
				field: v.picklist(productFields),
				stringValue: v.optional(v.string()),
				numberValue: v.optional(v.number()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				const value = input.stringValue ?? input.numberValue;
				await q.updateProductField(input.id, input.field, value ?? null);
				return { message: "Product field updated successfully" };
			} catch (error) {
				console.error("Error updating product field:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update product field",
					cause: error,
				});
			}
		}),
});
