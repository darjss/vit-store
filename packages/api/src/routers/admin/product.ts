import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import { addProductSchema, updateProductSchema } from "@vit/shared";
import { status } from "@vit/shared/constants";
import * as v from "valibot";
import { db } from "~/db/client";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { PRODUCT_PER_PAGE, editableProductFields } from "~/lib/constants";
import { scheduleProductSearchRebuild, searchProducts } from "~/lib/product-search/client";
import { getRestockWaitCount, listRestockWaitlist, scheduleRestockDispatch } from "~/lib/restock";
import { adminProcedure, type baseProcedure, botProcedure, router } from "~/lib/trpc";
const normalizeExpirationDate = (value?: string | null) => {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const yyyyMmMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
	if (yyyyMmMatch) {
		return `${yyyyMmMatch[1]}-${yyyyMmMatch[2]}`;
	}
	const mmYyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
	if (mmYyMatch) {
		return `20${mmYyMatch[2]}-${mmYyMatch[1]}`;
	}
	const mmYyyyMatch = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
	if (mmYyyyMatch) {
		return `${mmYyyyMatch[2]}-${mmYyyyMatch[1]}`;
	}
	return null;
};

const numericEditableProductFieldSet = new Set<string>([
	"brandId",
	"categoryId",
	"dailyIntake",
	"discount",
	"price",
	"stock",
]);
type NumericEditableProductField =
	| "brandId"
	| "categoryId"
	| "dailyIntake"
	| "discount"
	| "price"
	| "stock";

function isNumericEditableProductField(
	field: (typeof editableProductFields)[number],
): field is NumericEditableProductField {
	return numericEditableProductFieldSet.has(field);
}

function requireNonNegativeNumberField(
	field: NumericEditableProductField,
	numberValue: number | undefined,
): number {
	if (numberValue === undefined || !Number.isFinite(numberValue) || numberValue < 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${field} must be a non-negative number`,
		});
	}
	if (
		(field === "brandId" || field === "categoryId") &&
		(!Number.isInteger(numberValue) || numberValue < 1)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${field} must be a positive integer`,
		});
	}
	if (field !== "price" && !Number.isInteger(numberValue)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${field} must be an integer`,
		});
	}
	return numberValue;
}

function resolveEditableProductFieldValue(input: {
	field: (typeof editableProductFields)[number];
	numberValue?: number;
	stringValue?: string;
}): string | number | null {
	if (input.field === "expirationDate") {
		return normalizeExpirationDate(input.stringValue);
	}
	if (isNumericEditableProductField(input.field)) {
		return requireNonNegativeNumberField(input.field, input.numberValue);
	}
	return input.stringValue ?? null;
}

export function buildProductRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addProduct: proc.input(addProductSchema).mutation(async ({ ctx, input }) => {
			try {
				const normalizedExpirationDate = normalizeExpirationDate(input.expirationDate ?? null);
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
				const slug = productName
					.toLowerCase()
					.replaceAll(/[^a-z0-9]+/g, "-")
					.replaceAll(/^-+|-+$/g, "");
				const productResult = await db().transaction(async (tx) => {
					const created = await productQueries.admin.createProduct(
						{
							amount: input.amount,
							brandId: input.brandId,
							categoryId: input.categoryId,
							dailyIntake: input.dailyIntake,
							description: input.description,
							discount: 0,
							name: productName,
							potency: input.potency,
							price: input.price,
							slug,
							status: input.status || "active",
							stock: input.stock,
							// Optional AI-extracted fields
							expirationDate: normalizedExpirationDate,
							ingredients: input.ingredients || [],
							name_mn: input.name_mn || null,
							seoDescription: input.seoDescription || null,
							seoTitle: input.seoTitle || null,
							tags: input.tags || [],
							weightGrams: input.weightGrams || 0,
						},
						tx,
					);
					if (!created) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create product",
						});
					}
					const productId = created.id;
					const imagesToInsert = images.map((image, index) => ({
						isPrimary: index === 0,
						productId,
						url: image.url,
					}));
					await productQueries.admin.createProductImages(productId, imagesToInsert, tx);
					return created;
				});
				await purgeCatalogCache(ctx, [productResult.id]);
				scheduleProductSearchRebuild(ctx, "product_created");
				return { id: productResult.id, message: "Product added successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "addProduct",
				});
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add product",
				});
			}
		}),
		deleteProduct: proc.input(v.object({ id: v.number() })).mutation(async ({ ctx, input }) => {
			try {
				const product = await productQueries.admin.getProductById(input.id);
				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}
				await productQueries.admin.deleteProduct(input.id);
				await purgeCatalogCache(ctx, [input.id]);
				scheduleProductSearchRebuild(ctx, "product_deleted");
				return { message: "Product deleted successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "deleteProduct",
				});
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete product",
				});
			}
		}),
		getAllProducts: proc.query(async ({ ctx }) => {
			try {
				const products = await productQueries.admin.getAllProducts();
				return products;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getAllProducts",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch products",
				});
			}
		}),
		getAllProductValue: proc.query(async ({ ctx }) => {
			try {
				const result = await productQueries.admin.getAllProductValue();
				return result;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getAllProductValue",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to calculate product value",
				});
			}
		}),
		getPaginatedProducts: proc
			.input(
				v.object({
					brandId: v.optional(v.number()),
					categoryId: v.optional(v.number()),
					page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
					pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
					searchTerm: v.optional(v.string()),
					sortDirection: v.optional(v.picklist(["asc", "desc"])),
					sortField: v.optional(v.string()),
					status: v.optional(v.picklist(status)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await productQueries.admin.getPaginatedProducts({
						brandId: input.brandId,
						categoryId: input.categoryId,
						page: input.page ?? 1,
						pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
						searchTerm: input.searchTerm,
						sortDirection: input.sortDirection ?? "desc",
						sortField: input.sortField,
						status: input.status,
					});
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getPaginatedProducts",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch paginated products",
					});
				}
			}),
		getProductBenchmark: proc.query(async ({ ctx }) => {
			try {
				const startTime = performance.now();
				await productQueries.admin.getProductBenchmark();
				return performance.now() - startTime;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getProductBenchmark",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to run benchmark",
				});
			}
		}),
		getProductById: proc.input(v.object({ id: v.number() })).query(async ({ ctx, input }) => {
			try {
				const product = await productQueries.admin.getProductById(input.id);
				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}
				return product;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getProductById",
				});
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch product",
				});
			}
		}),
		getRestockWaitCount: proc
			.input(v.object({ productId: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
			.query(async ({ ctx, input }) => {
				try {
					const waitCount = await getRestockWaitCount(input.productId);
					return { productId: input.productId, waitCount };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getRestockWaitCount",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch restock wait count",
					});
				}
			}),
		getReviewProducts: proc.query(async ({ ctx }) => {
			try {
				return await productQueries.admin.getReviewProducts();
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getReviewProducts",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch review products",
				});
			}
		}),
		listRestockWaitlist: proc
			.input(
				v.object({
					limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await listRestockWaitlist(input.limit ?? 50);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "listRestockWaitlist",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch restock waitlist",
					});
				}
			}),
		searchProductByName: proc
			.input(v.object({ searchTerm: v.string() }))
			.query(async ({ ctx, input }) => {
				try {
					const products = await productQueries.admin.searchByName(input.searchTerm, 3);
					return products;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "searchProductByName",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to search products",
					});
				}
			}),
		searchProductsInstant: proc
			.input(
				v.object({
					brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
					categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
					limit: v.optional(v.number(), 10),
					query: v.pipe(v.string(), v.minLength(1)),
					status: v.optional(v.picklist(status)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const { brandId, categoryId, limit, query, status } = input;
					const safeLimit = Math.min(limit, 10);
					const searchResults = await searchProducts(query, safeLimit, {
						brandId,
						categoryId,
					});
					return searchResults
						.filter((result) => !status || result.status === status)
						.map((result) => ({
							id: result.id,
							images: result.image ? [{ url: result.image }] : [],
							name: result.name,
							price: result.price,
							slug: result.slug,
							status: result.status,
							stock: result.stock,
						}))
						.slice(0, safeLimit);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "searchProductsInstant",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to search products",
					});
				}
			}),
		setProductStock: proc
			.input(
				v.object({
					id: v.number(),
					newStock: v.pipe(v.number(), v.integer(), v.minValue(0)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const stockChange = await productQueries.admin.setProductStock(input.id, input.newStock);
					if (!stockChange) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Product not found",
						});
					}
					await purgeCatalogCache(ctx, [input.id]);
					scheduleProductSearchRebuild(ctx, "product_stock_updated");
					scheduleRestockDispatch(ctx, {
						newStock: stockChange.newStock,
						previousStock: stockChange.previousStock,
						productId: input.id,
					});
					return { message: "Stock set successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "setProductStock",
					});
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to set product stock",
					});
				}
			}),
		updateProduct: proc.input(updateProductSchema).mutation(async ({ ctx, input }) => {
			try {
				const normalizedExpirationDate = normalizeExpirationDate(input.expirationDate ?? null);
				if (!input.id) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Product ID is required",
					});
				}
				const { id: _id, images, ...productData } = input;
				const filteredImages = images.filter((image) => image.url.trim() !== "");
				for (const image of filteredImages) {
					const result = v.safeParse(v.pipe(v.string(), v.url()), image.url);
					if (!result.success) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Invalid image URL",
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
				const slug = productName
					.toLowerCase()
					.replaceAll(/[^a-z0-9]+/g, "-")
					.replaceAll(/^-+|-+$/g, "");
				const stockChange = await productQueries.admin.updateProduct(input.id, {
					...productData,
					expirationDate: normalizedExpirationDate,
					name: productName,
					slug,
				});
				// Always soft-delete + reinsert images on every updateProduct so
				// primary-image reorder (same URLs, different order) is honored.
				// The previous URL-only sorted diff missed isPrimary changes, so
				// reordering images to promote a different one to primary never
				// persisted. Images are cheap; reinserting avoids that bug.
				await productQueries.admin.softDeleteProductImages(input.id);
				if (filteredImages.length > 0) {
					const imagesToInsert = filteredImages.map((image, index) => ({
						isPrimary: index === 0,
						productId: input.id,
						url: image.url,
					}));
					await productQueries.admin.createProductImages(input.id, imagesToInsert);
				}
				await purgeCatalogCache(ctx, [input.id]);
				scheduleProductSearchRebuild(ctx, "product_updated");
				if (stockChange) {
					scheduleRestockDispatch(ctx, stockChange);
				}
				return { message: "Product updated successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "updateProduct",
				});
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update product",
				});
			}
		}),
		updateProductField: proc
			.input(
				v.object({
					field: v.picklist(editableProductFields),
					id: v.number(),
					numberValue: v.optional(v.number()),
					stringValue: v.optional(v.string()),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					let stockChange = null;
					if (input.field === "stock") {
						const stock = requireNonNegativeNumberField("stock", input.numberValue);
						stockChange = await productQueries.admin.setProductStock(input.id, stock);
					} else {
						const value = resolveEditableProductFieldValue(input);
						await productQueries.admin.updateProductField(input.id, input.field, value);
					}
					await purgeCatalogCache(ctx, [input.id]);
					scheduleProductSearchRebuild(ctx, "product_updated");
					if (stockChange) {
						scheduleRestockDispatch(ctx, stockChange);
					}
					return { message: "Product field updated successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "updateProductField",
					});
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to update product field",
					});
				}
			}),
		updateStock: proc
			.input(
				v.object({
					numberToUpdate: v.number(),
					productId: v.number(),
					type: v.picklist(["add", "minus"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const product = await productQueries.admin.getProductById(input.productId);
					if (!product) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Product not found",
						});
					}
					const stockChange = await productQueries.admin.updateStock(
						input.productId,
						input.numberToUpdate,
						input.type,
					);
					if (!stockChange) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Product not found",
						});
					}
					await purgeCatalogCache(ctx, [input.productId]);
					scheduleProductSearchRebuild(ctx, "product_stock_updated");
					if (input.type === "add") {
						scheduleRestockDispatch(ctx, {
							newStock: stockChange.newStock,
							previousStock: stockChange.previousStock,
							productId: input.productId,
						});
					}
					return { message: "Stock updated successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "updateStock",
					});
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to update stock",
					});
				}
			}),
	});
}
export const product = buildProductRouter(adminProcedure);
export const productBot = buildProductRouter(botProcedure);
