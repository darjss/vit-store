import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { ProductImagesTable, ProductsTable } from "../../db/schema";

export const storeProducts = {
	async getFeaturedProducts() {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
				name: true,
				price: true,
			},
			orderBy: asc(ProductsTable.updatedAt),
			limit: 4,
			where: and(
				eq(ProductsTable.isFeatured, true),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
				brand: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getNewProducts() {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				name: true,
				price: true,
				slug: true,
			},
			orderBy: desc(ProductsTable.updatedAt),
			limit: 4,
			where: and(
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
				brand: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getDiscountedProducts() {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
				name: true,
				price: true,
				discount: true,
			},
			orderBy: desc(ProductsTable.updatedAt),
			limit: 4,
			where: and(
				gt(ProductsTable.discount, 0),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
				brand: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getAllProducts() {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
			},
			where: isNull(ProductsTable.deletedAt),
		});
	},

	async getProductById(id: number) {
		return db.query.ProductsTable.findFirst({
			columns: {
				id: true,
				name: true,
				price: true,
				status: true,
				description: true,
				discount: true,
				amount: true,
				potency: true,
				dailyIntake: true,
				categoryId: true,
				brandId: true,
				ingredients: true,
				weightGrams: true,
				seoTitle: true,
				seoDescription: true,
			},
			where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			with: {
				images: {
					columns: {
						url: true,
						isPrimary: true,
					},
				},
				brand: {
					columns: {
						name: true,
					},
				},
				category: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getProductsByIds(ids: number[]) {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				name: true,
				price: true,
			},
			where: and(
				inArray(ProductsTable.id, ids),
				isNull(ProductsTable.deletedAt),
			),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
			},
		});
	},

	async getRecommendedProductsByCategory(
		categoryId: number,
		excludeProductId: number,
	) {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
				name: true,
				price: true,
				discount: true,
			},
			limit: 2,
			where: and(
				eq(ProductsTable.categoryId, categoryId),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
				sql`${ProductsTable.id} != ${excludeProductId}`,
			),
			orderBy: desc(ProductsTable.updatedAt),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
				brand: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getRecommendedProductsByBrand(
		brandId: number,
		excludeProductId: number,
	) {
		return db.query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
				name: true,
				price: true,
				discount: true,
			},
			limit: 2,
			where: and(
				eq(ProductsTable.brandId, brandId),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
				sql`${ProductsTable.id} != ${excludeProductId}`,
			),
			orderBy: desc(ProductsTable.updatedAt),
			with: {
				images: {
					columns: {
						url: true,
					},
					where: and(
						eq(ProductImagesTable.isPrimary, true),
						isNull(ProductImagesTable.deletedAt),
					),
				},
				brand: {
					columns: {
						name: true,
					},
				},
			},
		});
	},

	async getProductStockStatus(id: number) {
		return db.query.ProductsTable.findFirst({
			columns: {
				status: true,
				stock: true,
			},
			where: and(
				eq(ProductsTable.id, id),
				isNull(ProductsTable.deletedAt),
			),
		});
	},

	async getProductBenchmark(limit = 10) {
		return db.query.ProductsTable.findMany({
			limit,
			with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
		});
	},
};

