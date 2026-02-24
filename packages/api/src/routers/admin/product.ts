import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import { addProductSchema, updateProductSchema } from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, productFields } from "../../lib/constants";
import { adminProcedure, router } from "../../lib/trpc";
import {
	deleteProductFromSearch,
	searchProducts,
	upsertProductToSearch,
} from "../../lib/upstash-search";

const normalizeExpirationDate = (value?: string | null) => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const yyyyMmMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
	if (yyyyMmMatch) return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;

	const mmYyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
	if (mmYyMatch) return `20${mmYyMatch[2]}-${mmYyMatch[1]}`;

	const mmYyyyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
	if (mmYyyyMatch) return `${mmYyyyMatch[2]}-${mmYyyyMatch[1]}`;

	return null;
};

export const product = router({
	searchProductByName: adminProcedure
		.input(v.object({ searchTerm: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const products = await productQueries.admin.searchByName(
					input.searchTerm,
					3,
				);
				return products;
			} catch (error) {
				ctx.log.error("searchProductByName", error);
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
				const products = await productQueries.admin.searchByNameForOrder(
					input.searchTerm,
					3,
				);
				return products;
			} catch (error) {
				ctx.log.error("searchProductByNameForOrder", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products for order",
					cause: error,
				});
			}
		}),

	searchProductsInstant: adminProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { query, limit, brandId, categoryId } = input;
				const safeLimit = Math.min(limit, 10);
				const searchResults = await searchProducts(query, safeLimit, {
					brandId,
					categoryId,
				});

				if (searchResults.length === 0) return [];

				const ids = searchResults.map((result) => result.id);
				const dbProducts =
					await productQueries.admin.getProductsByIdsForSearch(ids);
				const byId = new Map(
					dbProducts.map((product) => [product.id, product]),
				);

				return searchResults
					.map((result) => {
						const product = byId.get(result.id);
						if (!product) return null;

						return {
							id: product.id,
							name: product.name,
							slug: product.slug,
							price: product.price,
							stock: product.stock,
							images: product.images.map((image) => ({
								url: image.url,
							})),
						};
					})
					.filter(
						(product): product is NonNullable<typeof product> => !!product,
					)
					.slice(0, safeLimit);
			} catch (error) {
				ctx.log.error("searchProductsInstant", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	addProduct: adminProcedure
		.input(addProductSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const expirationInput = (input as Record<string, unknown>)
					.expirationDate;
				const normalizedExpirationDate = normalizeExpirationDate(
					typeof expirationInput === "string" ? expirationInput : null,
				);
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
				const brand = await productQueries.admin.getBrandById(input.brandId);
				if (!brand) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				}
				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();
				const productResult = await productQueries.admin.createProduct({
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
					status: input.status || "active",
					// Optional AI-extracted fields
					name_mn: input.name_mn || null,
					ingredients: input.ingredients || [],
					tags: input.tags || [],
					seoTitle: input.seoTitle || null,
					seoDescription: input.seoDescription || null,
					weightGrams: input.weightGrams || 0,
					expirationDate: normalizedExpirationDate,
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
				await productQueries.admin.createProductImages(
					productId,
					imagesToInsert,
				);
				const createdProduct =
					await productQueries.admin.getProductById(productId);
				if (createdProduct) {
					await upsertProductToSearch({
						id: createdProduct.id,
						name: createdProduct.name,
						description: createdProduct.description,
						slug: createdProduct.slug,
						price: createdProduct.price,
						brand: createdProduct.brand?.name || "",
						category: createdProduct.category?.name || "",
						brandId: createdProduct.brandId,
						categoryId: createdProduct.categoryId,
						image:
							createdProduct.images.find((img) => img.isPrimary)?.url || "",
					});
				}
				return { message: "Product added successfully" };
			} catch (error) {
				ctx.log.error("addProduct", error);
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
			const startTime = performance.now();
			await productQueries.admin.getProductBenchmark();
			return performance.now() - startTime;
		} catch (error) {
			ctx.log.error("getProductBenchmark", error);
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
				const product = await productQueries.admin.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				return product;
			} catch (error) {
				ctx.log.error("getProductById", error);
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
				const expirationInput = (input as Record<string, unknown>)
					.expirationDate;
				const normalizedExpirationDate = normalizeExpirationDate(
					typeof expirationInput === "string" ? expirationInput : null,
				);
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
				const brand = await productQueries.admin.getBrandById(input.brandId);
				if (!brand)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Brand not found",
					});
				const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
				const slug = productName.replace(/\s+/g, "-").toLowerCase();
				await productQueries.admin.updateProduct(input.id, {
					...productData,
					expirationDate: normalizedExpirationDate,
					name: productName,
					slug,
				});
				const existingImages = await productQueries.admin.getProductImages(
					input.id,
				);
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
					await productQueries.admin.softDeleteProductImages(input.id);
					const imagesToInsert = filteredImages.map((image, index) => ({
						productId: input.id,
						url: image.url,
						isPrimary: index === 0,
					}));
					await productQueries.admin.createProductImages(
						input.id,
						imagesToInsert,
					);
				}
				return { message: "Product updated successfully" };
			} catch (error) {
				ctx.log.error("updateProduct", error);
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
				const product = await productQueries.admin.getProductById(
					input.productId,
				);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await productQueries.admin.updateStock(
					input.productId,
					input.numberToUpdate,
					input.type,
				);
				return { message: "Stock updated successfully" };
			} catch (error) {
				ctx.log.error("updateStock", error);
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
				const product = await productQueries.admin.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await productQueries.admin.deleteProduct(input.id);
				await deleteProductFromSearch(input.id);
				return { message: "Product deleted successfully" };
			} catch (error) {
				ctx.log.error("deleteProduct", error);
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
			const products = await productQueries.admin.getAllProducts();
			return products;
		} catch (error) {
			ctx.log.error("getAllProducts", error);
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
				return await productQueries.admin.getPaginatedProducts({
					page: input.page ?? 1,
					pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
					brandId: input.brandId,
					categoryId: input.categoryId,
					sortField: input.sortField,
					sortDirection: input.sortDirection ?? "desc",
					searchTerm: input.searchTerm,
				});
			} catch (error) {
				ctx.log.error("getPaginatedProducts", error);
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
				const product = await productQueries.admin.getProductById(input.id);
				if (!product)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				await productQueries.admin.setProductStock(input.id, input.newStock);
				return { message: "Stock set successfully" };
			} catch (error) {
				ctx.log.error("setProductStock", error);
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
			const result = await productQueries.admin.getAllProductValue();
			return result;
		} catch (error) {
			ctx.log.error("getAllProductValue", error);
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
				const value =
					String(input.field) === "expirationDate"
						? normalizeExpirationDate(input.stringValue)
						: (input.stringValue ?? input.numberValue);
				await productQueries.admin.updateProductField(
					input.id,
					input.field,
					value ?? null,
				);
				return { message: "Product field updated successfully" };
			} catch (error) {
				ctx.log.error("updateProductField", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update product field",
					cause: error,
				});
			}
		}),
});
