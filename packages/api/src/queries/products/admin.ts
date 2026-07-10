import { type status, PRODUCT_REVIEW_CUTOFF_DATE } from "@vit/shared/constants";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { db } from "~/db/client";
import { BrandsTable, ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";
import { applyStockTransition } from "~/lib/stock/transition";
import type { TransactionType } from "~/lib/types";

type DbOrTx = ReturnType<typeof db> | TransactionType;

type ProductStatus = (typeof status)[number];

import {
	hydrateProductsBySearchIds,
	searchProductIds,
} from "~/queries/products/shared";

export const adminQueries = {
		async searchByName(
			searchTerm: string,
			limit = 3,
			options?: { shape?: "full" | "order" },
		) {
			const shape = options?.shape ?? "full";
			const ids = await searchProductIds(searchTerm, limit);
			if (ids.length === 0) return [];

			if (shape === "order") {
				return hydrateProductsBySearchIds(ids, (productIds) =>
					db().query.ProductsTable.findMany({
						where: and(
							isNull(ProductsTable.deletedAt),
							inArray(ProductsTable.id, productIds),
						),
						columns: {
							id: true,
							name: true,
							price: true,
							stock: true,
						},
						with: {
							images: {
								columns: { url: true },
								where: and(
									eq(ProductImagesTable.isPrimary, true),
									isNull(ProductImagesTable.deletedAt),
								),
							},
						},
					}),
					limit,
				);
			}

			return hydrateProductsBySearchIds(ids, (productIds) =>
				db().query.ProductsTable.findMany({
					where: and(
						isNull(ProductsTable.deletedAt),
						inArray(ProductsTable.id, productIds),
					),
					with: {
						images: { where: isNull(ProductImagesTable.deletedAt) },
					},
				}),
				limit,
			);
		},

		async searchByNameForOrder(searchTerm: string, limit = 3) {
			return this.searchByName(searchTerm, limit, { shape: "order" });
		},

		async getBrandById(brandId: number) {
			return db().query.BrandsTable.findFirst({
				where: eq(BrandsTable.id, brandId),
			});
		},

		async createProduct(
			data: {
				name: string;
				slug: string;
				description: string;
				discount: number;
				amount: string;
				potency: string;
				stock: number;
				price: number;
				dailyIntake: number;
				categoryId: number;
				brandId: number;
				status: ProductStatus;
				// Optional AI-extracted fields
				name_mn?: string | null;
				ingredients?: string[];
				tags?: string[];
				seoTitle?: string | null;
				seoDescription?: string | null;
				weightGrams?: number;
				expirationDate?: string | null;
			},
			tx?: DbOrTx,
		) {
			const conn = tx ?? db();
			const result = await conn
				.insert(ProductsTable)
				.values(data)
				.returning();
			return result[0];
		},

		async createProductImages(
			productId: number,
			images: Array<{ url: string; isPrimary: boolean }>,
			tx?: DbOrTx,
		) {
			if (images.length === 0) return;
			const conn = tx ?? db();
			const values = images.map((img) => ({
				productId,
				url: img.url,
				isPrimary: img.isPrimary,
			}));
			await conn.insert(ProductImagesTable).values(values);
		},

		async getProductBenchmark() {
			return db().query.ProductsTable.findMany({
				with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
			});
		},

		async getProductById(id: number) {
			return db().query.ProductsTable.findFirst({
				where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
				with: {
					images: {
						columns: { id: true, url: true, isPrimary: true },
						where: isNull(ProductImagesTable.deletedAt),
					},
					category: { columns: { name: true } },
					brand: { columns: { name: true } },
				},
			});
		},

		async getProductBySlug(slug: string) {
			return db().query.ProductsTable.findFirst({
				where: and(
					eq(ProductsTable.slug, slug),
					isNull(ProductsTable.deletedAt),
				),
				columns: { id: true, slug: true },
			});
		},

		async updateProduct(
			id: number,
			data: {
				name: string;
				slug: string;
				description?: string;
				discount?: number;
				amount?: string;
				potency?: string;
				stock?: number;
				price?: number;
				dailyIntake?: number;
				categoryId?: number;
				brandId?: number;
				status?: ProductStatus;
				expirationDate?: string | null;
			},
		) {
			return db().transaction(async (tx) => {
				const { stock, ...productData } = data;
				await tx
					.update(ProductsTable)
					.set(productData)
					.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)));
				return stock === undefined
					? null
					: applyStockTransition(tx, { productId: id, setTo: stock });
			});
		},

		async getProductImages(productId: number) {
			return db()
				.select({ id: ProductImagesTable.id, url: ProductImagesTable.url })
				.from(ProductImagesTable)
				.where(
					and(
						eq(ProductImagesTable.productId, productId),
						isNull(ProductImagesTable.deletedAt),
					),
				);
		},

		async softDeleteProductImages(productId: number) {
			const images = await this.getProductImages(productId);
			const deletePromises = images.map((image) =>
				db()
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
		},

		async updateStock(
			productId: number,
			numberToUpdate: number,
			type: "add" | "minus",
		) {
			return db().transaction((tx) =>
				applyStockTransition(tx, {
					productId,
					delta: type === "add" ? numberToUpdate : -numberToUpdate,
				}),
			);
		},

		async updateStockTx(
			tx: TransactionType,
			productId: number,
			numberToUpdate: number,
			type: "add" | "minus",
		) {
			return applyStockTransition(tx, {
				productId,
				delta: type === "add" ? numberToUpdate : -numberToUpdate,
			});
		},

		async deleteProduct(id: number) {
			await db()
				.update(ProductsTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)));
		},

		async getAllProducts() {
			return db().query.ProductsTable.findMany({
				where: isNull(ProductsTable.deletedAt),
				with: {
					images: {
						columns: { id: true, url: true, isPrimary: true },
						where: isNull(ProductImagesTable.deletedAt),
					},
				},
			});
		},

		async getPaginatedProducts(params: {
			page: number;
			pageSize: number;
			brandId?: number;
			categoryId?: number;
			status?: ProductStatus;
			sortField?: string;
			sortDirection?: "asc" | "desc";
			searchTerm?: string;
		}) {
			const conditions: (SQL<unknown> | undefined)[] = [];
			let searchIds: number[] | undefined;
			if (params.brandId !== undefined && params.brandId !== 0)
				conditions.push(eq(ProductsTable.brandId, params.brandId));
			if (params.categoryId !== undefined && params.categoryId !== 0)
				conditions.push(eq(ProductsTable.categoryId, params.categoryId));
			if (params.status !== undefined) {
				conditions.push(eq(ProductsTable.status, params.status));
			}
			if (params.searchTerm !== undefined && params.searchTerm.trim() !== "") {
				const searchResults = await searchProducts(
					params.searchTerm.trim(),
					1000,
					{
						brandId:
							params.brandId !== undefined && params.brandId !== 0
								? params.brandId
								: undefined,
						categoryId:
							params.categoryId !== undefined && params.categoryId !== 0
								? params.categoryId
								: undefined,
					},
				);
				searchIds = searchResults.map((result) => result.id);

				if (searchIds.length === 0) {
					return {
						products: [],
						pagination: {
							currentPage: params.page,
							hasNextPage: false,
							hasPreviousPage: params.page > 1,
						},
					};
				}

				conditions.push(inArray(ProductsTable.id, searchIds));
			}
			const orderByClauses: SQL<unknown>[] = [];
			const primarySortColumn =
				params.sortField === "price"
					? ProductsTable.price
					: params.sortField === "stock"
						? ProductsTable.stock
						: ProductsTable.createdAt;
			const primaryOrderBy =
				params.sortDirection === "asc"
					? asc(primarySortColumn)
					: desc(primarySortColumn);
			orderByClauses.push(primaryOrderBy);
			orderByClauses.push(asc(ProductsTable.id));
			const finalConditions = conditions.filter(
				(c): c is SQL<unknown> => c !== undefined,
			);
			const offset = (params.page - 1) * params.pageSize;

			if (searchIds !== undefined && params.sortField === undefined) {
				const products = await db().query.ProductsTable.findMany({
					where: and(
						isNull(ProductsTable.deletedAt),
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					),
					with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
				});
				const byId = new Map(products.map((product) => [product.id, product]));
				const orderedProducts = searchIds
					.map((id) => byId.get(id))
					.filter((product): product is NonNullable<typeof product> =>
						Boolean(product),
					);

				return {
					products: orderedProducts.slice(offset, offset + params.pageSize),
					pagination: {
						currentPage: params.page,
						hasNextPage: offset + params.pageSize < orderedProducts.length,
						hasPreviousPage: params.page > 1,
					},
				};
			}

			const items = await db().query.ProductsTable.findMany({
				limit: params.pageSize + 1,
				offset: offset,
				orderBy: orderByClauses,
				where: and(
					isNull(ProductsTable.deletedAt),
					finalConditions.length > 0 ? and(...finalConditions) : undefined,
				),
				with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
			});

			const hasNextPage = items.length > params.pageSize;
			const products = hasNextPage ? items.slice(0, params.pageSize) : items;

			return {
				products,
				pagination: {
					currentPage: params.page,
					hasNextPage,
					hasPreviousPage: params.page > 1,
				},
			};
		},

		async setProductStock(id: number, newStock: number) {
			return db().transaction((tx) =>
				applyStockTransition(tx, { productId: id, setTo: newStock }),
			);
		},

		async getAllProductValue() {
			const result = await db()
				.select({ stock: ProductsTable.stock, price: ProductsTable.price })
				.from(ProductsTable)
				.where(isNull(ProductsTable.deletedAt));
			return result.reduce(
				(acc, product) => acc + product.price * product.stock,
				0,
			);
		},

		async updateProductField(
			id: number,
			field: string,
			value: string | number | null,
		) {
			if (field === "stock" && typeof value === "number") {
				return this.setProductStock(id, value);
			}
			await db()
				.update(ProductsTable)
				.set({ [field]: value })
				.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)));
			return null;
		},

		async getReviewProducts() {
			const reviewCutoff = new Date(PRODUCT_REVIEW_CUTOFF_DATE);
			return db().query.ProductsTable.findMany({
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					or(
						isNull(ProductsTable.updatedAt),
						lt(ProductsTable.updatedAt, reviewCutoff),
					),
				),
				orderBy: sql`${ProductsTable.updatedAt} ASC NULLS FIRST`,
				with: {
					images: {
						where: isNull(ProductImagesTable.deletedAt),
					},
					category: { columns: { name: true } },
					brand: { columns: { name: true } },
				},
			});
		},
};
