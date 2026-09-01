import { PRODUCT_REVIEW_CUTOFF_DATE, type status } from "@vit/shared/constants";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { BrandsTable, ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";
import { applyStockTransition } from "~/lib/stock/transition";
import type { TransactionType } from "~/lib/types";

type DbOrTx = ReturnType<typeof db> | TransactionType;

type ProductStatus = (typeof status)[number];

import { hydrateProductsBySearchIds, searchProductIds } from "~/queries/products/shared";

async function resolveProductSearchIds(params: {
	brandId?: number;
	categoryId?: number;
	page: number;
	searchTerm?: string;
}) {
	if (params.searchTerm === undefined || params.searchTerm.trim() === "") {
		return undefined;
	}

	const searchResults = await searchProducts(params.searchTerm.trim(), 1000, {
		brandId: params.brandId !== undefined && params.brandId !== 0 ? params.brandId : undefined,
		categoryId:
			params.categoryId !== undefined && params.categoryId !== 0 ? params.categoryId : undefined,
	});
	const searchIds = searchResults.map((result) => result.id);
	if (searchIds.length === 0) {
		return { empty: true as const, searchIds };
	}
	return { empty: false as const, searchIds };
}

function buildProductFilterConditions(params: {
	brandId?: number;
	categoryId?: number;
	searchIds?: Array<number>;
	status?: ProductStatus;
}) {
	const conditions: Array<SQL<unknown> | undefined> = [];
	if (params.brandId !== undefined && params.brandId !== 0) {
		conditions.push(eq(ProductsTable.brandId, params.brandId));
	}
	if (params.categoryId !== undefined && params.categoryId !== 0) {
		conditions.push(eq(ProductsTable.categoryId, params.categoryId));
	}
	if (params.status !== undefined) {
		conditions.push(eq(ProductsTable.status, params.status));
	}
	if (params.searchIds !== undefined) {
		conditions.push(inArray(ProductsTable.id, params.searchIds));
	}
	return conditions.filter((condition): condition is SQL<unknown> => condition !== undefined);
}

export const adminQueries = {
	async createProduct(
		data: {
			amount: string;
			brandId: number;
			categoryId: number;
			dailyIntake: number;
			description: string;
			discount: number;
			expirationDate?: string | null;
			ingredients?: Array<string>;
			name: string;
			// Optional AI-extracted fields
			name_mn?: string | null;
			potency: string;
			price: number;
			seoDescription?: string | null;
			seoTitle?: string | null;
			slug: string;
			status: ProductStatus;
			stock: number;
			tags?: Array<string>;
			weightGrams?: number;
		},
		tx?: DbOrTx,
	) {
		const conn = tx ?? db();
		const result = await conn.insert(ProductsTable).values(data).returning();
		return result[0];
	},

	async createProductImages(
		productId: number,
		images: Array<{ isPrimary: boolean; url: string }>,
		tx?: DbOrTx,
	) {
		if (images.length === 0) {
			return;
		}
		const conn = tx ?? db();
		const values = images.map((img) => ({
			isPrimary: img.isPrimary,
			productId,
			url: img.url,
		}));
		await conn.insert(ProductImagesTable).values(values);
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
					columns: { id: true, isPrimary: true, url: true },
					where: isNull(ProductImagesTable.deletedAt),
				},
			},
		});
	},

	async getAllProductValue() {
		const result = await db()
			.select({ price: ProductsTable.price, stock: ProductsTable.stock })
			.from(ProductsTable)
			.where(isNull(ProductsTable.deletedAt));
		return result.reduce((acc, product) => acc + product.price * product.stock, 0);
	},

	async getBrandById(brandId: number) {
		return db().query.BrandsTable.findFirst({
			where: eq(BrandsTable.id, brandId),
		});
	},

	async getPaginatedProducts(params: {
		brandId?: number;
		categoryId?: number;
		page: number;
		pageSize: number;
		searchTerm?: string;
		sortDirection?: "asc" | "desc";
		sortField?: string;
		status?: ProductStatus;
	}) {
		const searchResult = await resolveProductSearchIds(params);
		if (searchResult?.empty) {
			return {
				pagination: {
					currentPage: params.page,
					hasNextPage: false,
					hasPreviousPage: params.page > 1,
				},
				products: [],
			};
		}
		const searchIds = searchResult?.searchIds;
		const finalConditions = buildProductFilterConditions({ ...params, searchIds });
		const orderByClauses: Array<SQL<unknown>> = [];
		// Date sort uses last-modified time; never-updated products fall
		// back to created_at since updated_at is NULL until first update.
		const primarySortColumn =
			params.sortField === "price"
				? ProductsTable.price
				: params.sortField === "stock"
					? ProductsTable.stock
					: sql`coalesce(${ProductsTable.updatedAt}, ${ProductsTable.createdAt})`;
		const primaryOrderBy =
			params.sortDirection === "asc" ? asc(primarySortColumn) : desc(primarySortColumn);
		orderByClauses.push(primaryOrderBy, asc(ProductsTable.id));
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
				.filter((product): product is NonNullable<typeof product> => Boolean(product));

			return {
				pagination: {
					currentPage: params.page,
					hasNextPage: offset + params.pageSize < orderedProducts.length,
					hasPreviousPage: params.page > 1,
				},
				products: orderedProducts.slice(offset, offset + params.pageSize),
			};
		}

		const items = await db().query.ProductsTable.findMany({
			limit: params.pageSize + 1,
			offset,
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
			pagination: {
				currentPage: params.page,
				hasNextPage,
				hasPreviousPage: params.page > 1,
			},
			products,
		};
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
				brand: { columns: { name: true } },
				category: { columns: { name: true } },
				images: {
					columns: { id: true, isPrimary: true, url: true },
					where: isNull(ProductImagesTable.deletedAt),
				},
			},
		});
	},

	async getProductBySlug(slug: string) {
		return db().query.ProductsTable.findFirst({
			columns: { id: true, slug: true },
			where: and(eq(ProductsTable.slug, slug), isNull(ProductsTable.deletedAt)),
		});
	},

	async getProductImages(productId: number) {
		return db()
			.select({ id: ProductImagesTable.id, url: ProductImagesTable.url })
			.from(ProductImagesTable)
			.where(
				and(eq(ProductImagesTable.productId, productId), isNull(ProductImagesTable.deletedAt)),
			);
	},

	async getReviewProducts() {
		const reviewCutoff = new Date(PRODUCT_REVIEW_CUTOFF_DATE);
		return db().query.ProductsTable.findMany({
			orderBy: sql`${ProductsTable.updatedAt} ASC NULLS FIRST`,
			where: and(
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
				or(isNull(ProductsTable.updatedAt), lt(ProductsTable.updatedAt, reviewCutoff)),
			),
			with: {
				brand: { columns: { name: true } },
				category: { columns: { name: true } },
				images: {
					where: isNull(ProductImagesTable.deletedAt),
				},
			},
		});
	},

	async searchByName(searchTerm: string, limit = 3) {
		const ids = await searchProductIds(searchTerm, limit);
		if (ids.length === 0) {
			return [];
		}

		return hydrateProductsBySearchIds(
			ids,
			(productIds) =>
				db().query.ProductsTable.findMany({
					where: and(isNull(ProductsTable.deletedAt), inArray(ProductsTable.id, productIds)),
					with: {
						images: { where: isNull(ProductImagesTable.deletedAt) },
					},
				}),
			limit,
		);
	},

	async setProductStock(id: number, newStock: number) {
		return db().transaction((tx) => applyStockTransition(tx, { productId: id, setTo: newStock }));
	},

	async softDeleteProductImages(productId: number) {
		const images = await this.getProductImages(productId);
		const deletePromises = images.map((image) =>
			db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(ProductImagesTable.id, image.id), isNull(ProductImagesTable.deletedAt))),
		);
		await Promise.allSettled(deletePromises);
	},

	async updateProduct(
		id: number,
		data: {
			amount?: string;
			brandId?: number;
			categoryId?: number;
			dailyIntake?: number;
			description?: string;
			discount?: number;
			expirationDate?: string | null;
			name: string;
			potency?: string;
			price?: number;
			slug: string;
			status?: ProductStatus;
			stock?: number;
		},
	) {
		return db().transaction(async (tx) => {
			const [currentProduct] = await tx
				.select({ oldSlugs: ProductsTable.oldSlugs, slug: ProductsTable.slug })
				.from(ProductsTable)
				.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)))
				.for("update");
			if (!currentProduct) {
				return null;
			}

			const { stock, ...productData } = data;
			const oldSlugs = [...new Set(currentProduct.oldSlugs.filter((slug) => slug !== data.slug))];
			if (currentProduct.slug !== data.slug && !oldSlugs.includes(currentProduct.slug)) {
				oldSlugs.push(currentProduct.slug);
			}
			await tx
				.update(ProductsTable)
				.set({ ...productData, oldSlugs })
				.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)));
			return stock === undefined ? null : applyStockTransition(tx, { productId: id, setTo: stock });
		});
	},

	async updateProductField(id: number, field: string, value: string | number | null) {
		await db()
			.update(ProductsTable)
			.set({ [field]: value })
			.where(and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)));
		return null;
	},

	async updateStock(productId: number, numberToUpdate: number, type: "add" | "minus") {
		return db().transaction((tx) =>
			applyStockTransition(tx, {
				delta: type === "add" ? numberToUpdate : -numberToUpdate,
				productId,
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
			delta: type === "add" ? numberToUpdate : -numberToUpdate,
			productId,
		});
	},
};
