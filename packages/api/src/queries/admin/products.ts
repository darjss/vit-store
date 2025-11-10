import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "../../db";
import {
	BrandsTable,
	ProductImagesTable,
	ProductsTable,
} from "../../db/schema";

export const adminProducts = {
	async searchByName(searchTerm: string, limit = 3) {
		return db.query.ProductsTable.findMany({
			where: and(
				isNull(ProductsTable.deletedAt),
				like(ProductsTable.name, `%${searchTerm}%`),
			),
			limit,
			with: {
				images: { where: isNull(ProductImagesTable.deletedAt) },
			},
		});
	},

	async searchByNameForOrder(searchTerm: string, limit = 3) {
		return db.query.ProductsTable.findMany({
			where: and(
				isNull(ProductsTable.deletedAt),
				like(ProductsTable.name, `%${searchTerm}%`),
			),
			limit,
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
		});
	},

	async getBrandById(brandId: number) {
		return db.query.BrandsTable.findFirst({
			where: eq(BrandsTable.id, brandId),
		});
	},

	async createProduct(data: {
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
		status: string;
	}) {
		const result = await db
			.insert(ProductsTable)
			.values(data)
			.returning();
		return result[0];
	},

	async createProductImages(
		productId: number,
		images: Array<{ url: string; isPrimary: boolean }>,
	) {
		const values = images.map((img) => ({
			productId,
			url: img.url,
			isPrimary: img.isPrimary,
		}));
		await db.insert(ProductImagesTable).values(values);
	},

	async getProductBenchmark() {
		return db.query.ProductsTable.findMany({
			with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
		});
	},

	async getProductById(id: number) {
		return db.query.ProductsTable.findFirst({
			where: and(
				eq(ProductsTable.id, id),
				isNull(ProductsTable.deletedAt),
			),
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
			status?: string;
		},
	) {
		await db
			.update(ProductsTable)
			.set(data)
			.where(
				and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			);
	},

	async getProductImages(productId: number) {
		return db
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
			db
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
		await db
			.update(ProductsTable)
			.set({
				stock: sql`${ProductsTable.stock} ${type === "add" ? "+" : "-"} ${numberToUpdate}`,
			})
			.where(
				and(
					eq(ProductsTable.id, productId),
					isNull(ProductsTable.deletedAt),
				),
			);
	},

	async deleteProduct(id: number) {
		await db
			.update(ProductsTable)
			.set({ deletedAt: new Date() })
			.where(
				and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			);
	},

	async getAllProducts() {
		return db.query.ProductsTable.findMany({
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
		sortField?: string;
		sortDirection?: "asc" | "desc";
		searchTerm?: string;
	}) {
		const conditions: (SQL<unknown> | undefined)[] = [];
		if (params.brandId !== undefined && params.brandId !== 0)
			conditions.push(eq(ProductsTable.brandId, params.brandId));
		if (params.categoryId !== undefined && params.categoryId !== 0)
			conditions.push(eq(ProductsTable.categoryId, params.categoryId));
		if (params.searchTerm !== undefined)
			conditions.push(like(ProductsTable.name, `%${params.searchTerm}%`));
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
		const products = await db.query.ProductsTable.findMany({
			limit: params.pageSize,
			offset: offset,
			orderBy: orderByClauses,
			where: and(
				isNull(ProductsTable.deletedAt),
				finalConditions.length > 0 ? and(...finalConditions) : undefined,
			),
			with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
		});
		const totalCountResult = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(ProductsTable)
			.where(
				and(
					isNull(ProductsTable.deletedAt),
					finalConditions.length > 0 ? and(...finalConditions) : undefined,
				),
			)
			.get();
		const totalCount = totalCountResult?.count ?? 0;
		const totalPages = Math.ceil(totalCount / params.pageSize);
		return {
			products,
			pagination: {
				currentPage: params.page,
				totalPages,
				totalCount,
				hasNextPage: params.page < totalPages,
				hasPreviousPage: params.page > 1,
			},
		};
	},

	async setProductStock(id: number, newStock: number) {
		await db
			.update(ProductsTable)
			.set({ stock: newStock })
			.where(
				and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			);
	},

	async getAllProductValue() {
		const result = await db
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
		await db
			.update(ProductsTable)
			.set({ [field]: value })
			.where(
				and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			);
	},
};

