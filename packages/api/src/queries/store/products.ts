import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import type { DB } from "../../db";
import { ProductImagesTable, ProductsTable } from "../../db/schema";

export function storeProducts(db: DB) {
	return {
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
				where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			});
		},

		async getProductBenchmark(limit = 10) {
			return db.query.ProductsTable.findMany({
				limit,
				with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
			});
		},

		async getInfiniteProducts(
			cursor: string | undefined,
			limit: number,
		){
			let items: {
				id: number;
				name: string;
				price: number;
				slug: string;
				createdAt: Date;
				images: { url: string | null }[];
				brand?: { name: string } | null;
			}[];
			if (!cursor) {
				items = await db.query.ProductsTable.findMany({
					limit,
					columns: {
						id: true,
						name: true,
						price: true,
						slug: true,
						createdAt: true,
					},
					where: and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
					),
					orderBy: [desc(ProductsTable.createdAt), desc(ProductsTable.id)],
					with: {
						images: {
							columns: {
								url: true,
							},
							where: and(
								isNull(ProductImagesTable.deletedAt),
								eq(ProductImagesTable.isPrimary, true),
							),
						},
						brand: {
							columns: {
								name: true,
							},
						},
					},
				});
			} else {
				const [createdAtStr, idStr] = cursor.split(",");
				const createdAt = new Date(createdAtStr);
				const id = Number.parseInt(idStr, 10);
				items = await db.query.ProductsTable.findMany({
					limit,
					columns: {
						id: true,
						slug: true,
						name: true,
						price: true,
						createdAt: true,
					},
					where: and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
						or(
							lt(ProductsTable.createdAt, createdAt),
							and(
								eq(ProductsTable.createdAt, createdAt),
								lt(ProductsTable.id, id),
							),
						),
					),
					orderBy: [desc(ProductsTable.createdAt), desc(ProductsTable.id)],
					with: {
						images: {
							columns: {
								url: true,
							},
							where: and(
								isNull(ProductImagesTable.deletedAt),
								eq(ProductImagesTable.isPrimary, true),
							),
						},
						brand: {
							columns: {
								name: true,
							},
						},
					},
				});
			}

			const nextCursor =
				items.length === limit && items.length > 0
					? `${items[items.length - 1].createdAt.toISOString()},${items[items.length - 1].id}`
					: null;

			return {
				items,
				nextCursor,
			};
		},
	};
}
