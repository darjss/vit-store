import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { BrandsTable, ProductImagesTable, ProductsTable } from "@/db/schema";
import { PRODUCT_PER_PAGE } from "@/lib/constants";
import { adminProcedure, router } from "@/lib/trpc";
import { addProductSchema, updateProductSchema } from "@/lib/zod/schema";

export const product = router({
	searchProductByName: adminProcedure
		.input(z.object({ searchTerm: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const products = await ctx.db.query.ProductsTable.findMany({
					where: like(ProductsTable.name, `%${input.searchTerm}%`),
					limit: 3,
					with: {
						images: true,
					},
				});
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
		.input(z.object({ searchTerm: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const products = await ctx.db.query.ProductsTable.findMany({
					where: like(ProductsTable.name, `%${input.searchTerm}%`),
					limit: 3,
					columns: {
						id: true,
						name: true,
						price: true,
						stock: true,
					},
					with: {
						images: {
							columns: {
								url: true,
							},
							where: eq(ProductImagesTable.isPrimary, true),
						},
					},
				});
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
				// Remove the last empty image if present
				const images = input.images.filter((image) => image.url.trim() !== "");

				// Validate image URLs
				for (const image of images) {
					const parsed = z.string().url().safeParse(image.url);
					if (!parsed.success) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Invalid image URL: ${image.url}`,
						});
					}
				}
				const brand = await ctx.db.query.BrandsTable.findFirst({
					where: eq(BrandsTable.id, input.brandId),
				});

				if (!brand) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				}

				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();

				const [productResult] = await ctx.db
					.insert(ProductsTable)
					.values({
						name: productName,
						slug: slug,
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
					})
					.returning();

				if (!productResult) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create product",
					});
				}

				const productId = productResult.id;
				console.log(`Product added with id: ${productId}`);

				// Add images
				const imagePromises = images.map((image, index) =>
					ctx.db.insert(ProductImagesTable).values({
						productId: productId,
						url: image.url,
						isPrimary: index === 0,
					}),
				);

				await Promise.all(imagePromises);
				console.log("Images added successfully");

				return { message: "Product added successfully" };
			} catch (error) {
				console.error("Error adding product:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add product",
					cause: error,
				});
			}
		}),

	getProductBenchmark: adminProcedure.query(async ({ ctx }) => {
		try {
			const startTime = performance.now();
			await ctx.db.query.ProductsTable.findMany({
				with: {
					images: true,
				},
			});
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
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			try {
				console.log("Fetching product with id", input.id);
				const product = await ctx.db.query.ProductsTable.findFirst({
					where: eq(ProductsTable.id, input.id),
					with: {
						images: {
							columns: {
								id: true,
								url: true,
								isPrimary: true,
							},
						},
					},
				});

				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}

				console.log(product);
				return product;
			} catch (error) {
				console.error("Error fetching product:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
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
				console.log("updating product");
				if (!input.id) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Product ID is required",
					});
				}

				const { images, ...productData } = input;
				const filteredImages = images.filter(
					(image) => image.url.trim() !== "",
				);

				// Validate image URLs
				for (const image of filteredImages) {
					const parsed = z.string().url().safeParse(image.url);
					if (!parsed.success) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Invalid image URL",
						});
					}
				}

				const brand = await ctx.db.query.BrandsTable.findFirst({
					where: eq(BrandsTable.id, input.brandId),
				});

				if (!brand) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				}

				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();

				await ctx.db
					.update(ProductsTable)
					.set({ ...productData, name: productName, slug: slug })
					.where(eq(ProductsTable.id, input.id));

				const existingImages = await ctx.db
					.select({
						id: ProductImagesTable.id,
						url: ProductImagesTable.url,
					})
					.from(ProductImagesTable)
					.where(eq(ProductImagesTable.productId, input.id));

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
					// Delete existing images
					const deletePromises = existingImages.map((image) =>
						ctx.db
							.delete(ProductImagesTable)
							.where(eq(ProductImagesTable.id, image.id)),
					);
					await Promise.allSettled(deletePromises);

					// Insert new images
					const insertPromises = filteredImages.map((image, index) =>
						ctx.db.insert(ProductImagesTable).values({
							productId: input.id,
							url: image.url,
							isPrimary: index === 0,
						}),
					);
					await Promise.allSettled(insertPromises);
				}

				return { message: "Product updated successfully" };
			} catch (error) {
				console.error("Error updating product:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update product",
					cause: error,
				});
			}
		}),

	updateStock: adminProcedure
		.input(
			z.object({
				productId: z.number(),
				numberToUpdate: z.number(),
				type: z.enum(["add", "minus"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				// Check if product exists
				const product = await ctx.db.query.ProductsTable.findFirst({
					where: eq(ProductsTable.id, input.productId),
				});

				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}

				await ctx.db
					.update(ProductsTable)
					.set({
						stock: sql`${ProductsTable.stock} ${input.type === "add" ? "+" : "-"} ${input.numberToUpdate}`,
					})
					.where(eq(ProductsTable.id, input.productId));

				return { message: "Stock updated successfully" };
			} catch (error) {
				console.error("Error updating stock:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update stock",
					cause: error,
				});
			}
		}),

	deleteProduct: adminProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const product = await ctx.db.query.ProductsTable.findFirst({
					where: eq(ProductsTable.id, input.id),
				});

				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}

				await ctx.db
					.delete(ProductsTable)
					.where(eq(ProductsTable.id, input.id));

				return { message: "Product deleted successfully" };
			} catch (error) {
				console.error("Error deleting product:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete product",
					cause: error,
				});
			}
		}),

	getAllProducts: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("fetching products");
			const products = await ctx.db.query.ProductsTable.findMany({
				with: {
					images: {
						columns: {
							id: true,
							url: true,
							isPrimary: true,
						},
					},
				},
			});
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
			z.object({
				page: z.number().default(1),
				pageSize: z.number().default(PRODUCT_PER_PAGE),
				brandId: z.number().optional(),
				categoryId: z.number().optional(),
				sortField: z.string().optional(),
				sortDirection: z.enum(["asc", "desc"]).default("asc"),
				searchTerm: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				console.log(
					"Fetching paginated products with page:",
					input.page,
					"pageSize:",
					input.pageSize,
					"brandId:",
					input.brandId,
					"categoryId:",
					input.categoryId,
					"sortField:",
					input.sortField,
					"sortDirection:",
					input.sortDirection,
					"searchTerm:",
					input.searchTerm,
				);

				const conditions: (SQL<unknown> | undefined)[] = [];

				if (input.brandId !== undefined && input.brandId !== 0) {
					conditions.push(eq(ProductsTable.brandId, input.brandId));
				}
				if (input.categoryId !== undefined && input.categoryId !== 0) {
					conditions.push(eq(ProductsTable.categoryId, input.categoryId));
				}
				if(input.searchTerm!==undefined){
				conditions.push(like(ProductsTable.name, `%${input.searchTerm}%`));
				}
				const orderByClauses: SQL<unknown>[] = [];
				const primarySortColumn =
					input.sortField === "price"
						? ProductsTable.price
						: input.sortField === "stock"
							? ProductsTable.stock
							: ProductsTable.createdAt;

				const primaryOrderBy =
					input.sortDirection === "asc"
						? asc(primarySortColumn)
						: desc(primarySortColumn);

				orderByClauses.push(primaryOrderBy);
				orderByClauses.push(asc(ProductsTable.id));

				const finalConditions = conditions.filter(
					(c): c is SQL<unknown> => c !== undefined,
				);

				const offset = (input.page - 1) * input.pageSize;

				const products = await ctx.db.query.ProductsTable.findMany({
					limit: input.pageSize,
					offset: offset,
					orderBy: orderByClauses,
					where:
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					with: {
						images: true,
					},
				});

				const totalCountResult = await ctx.db
					.select({ count: sql<number>`COUNT(*)` })
					.from(ProductsTable)
					.where(
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					)
					.get();

				const totalCount = totalCountResult?.count ?? 0;
				const totalPages = Math.ceil(totalCount / input.pageSize);

				return {
					products,
					pagination: {
						currentPage: input.page,
						totalPages,
						totalCount,
						hasNextPage: input.page < totalPages,
						hasPreviousPage: input.page > 1,
					},
				};
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
		.input(
			z.object({
				id: z.number(),
				newStock: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				// Check if product exists
				const product = await ctx.db.query.ProductsTable.findFirst({
					where: eq(ProductsTable.id, input.id),
				});

				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}

				await ctx.db
					.update(ProductsTable)
					.set({ stock: input.newStock })
					.where(eq(ProductsTable.id, input.id));

				return { message: "Stock set successfully" };
			} catch (error) {
				console.error("Error setting product stock:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to set product stock",
					cause: error,
				});
			}
		}),

	getAllProductValue: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({ stock: ProductsTable.stock, price: ProductsTable.price })
				.from(ProductsTable);

			const total = result.reduce(
				(acc, product) => acc + product.price * product.stock,
				0,
			);
			return total;
		} catch (error) {
			console.error("Error calculating product value:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to calculate product value",
				cause: error,
			});
		}
	}),
});
