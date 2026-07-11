import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { CategoriesTable, ProductsTable } from "~/db/schema";

export const categoryQueries = {
	admin: {
		async getAllCategories() {
			return db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					slug: CategoriesTable.slug,
					description: CategoriesTable.description,
					bannerImage: CategoriesTable.bannerImage,
					seoTitle: CategoriesTable.seoTitle,
					seoDescription: CategoriesTable.seoDescription,
					createdAt: CategoriesTable.createdAt,
					updatedAt: CategoriesTable.updatedAt,
				})
				.from(CategoriesTable)
				.where(isNull(CategoriesTable.deletedAt));
		},

		async createCategory(data: {
			name: string;
			slug: string;
			description?: string | null;
			bannerImage?: string | null;
			seoTitle?: string | null;
			seoDescription?: string | null;
		}) {
			await db().insert(CategoriesTable).values(data);
		},

		async updateCategory(
			id: number,
			data: {
				name: string;
				slug: string;
				description?: string | null;
				bannerImage?: string | null;
				seoTitle?: string | null;
				seoDescription?: string | null;
			},
		) {
			await db()
				.update(CategoriesTable)
				.set(data)
				.where(
					and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
				);
		},

		async deleteCategory(id: number) {
			await db()
				.update(CategoriesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
				);
		},

		async getCategoryById(id: number) {
			const result = await db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					slug: CategoriesTable.slug,
					description: CategoriesTable.description,
					bannerImage: CategoriesTable.bannerImage,
					seoTitle: CategoriesTable.seoTitle,
					seoDescription: CategoriesTable.seoDescription,
					createdAt: CategoriesTable.createdAt,
					updatedAt: CategoriesTable.updatedAt,
				})
				.from(CategoriesTable)
				.where(
					and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
				)
				.limit(1);
			return result[0] || null;
		},
	},

	store: {
		async getAllCategoryNames() {
			const categories = await db().query.CategoriesTable.findMany({
				columns: {
					name: true,
				},
			});
			return categories.map((category) => category.name);
		},

		async getAllCategories() {
			const productCount = sql<number>`count(${ProductsTable.id})::int`;

			return db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					slug: CategoriesTable.slug,
					productCount,
				})
				.from(CategoriesTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.categoryId, CategoriesTable.id),
						eq(ProductsTable.status, "active"),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(isNull(CategoriesTable.deletedAt))
				.groupBy(CategoriesTable.id, CategoriesTable.name, CategoriesTable.slug)
				.orderBy(desc(productCount), asc(CategoriesTable.name));
		},

		async getCategoryBySlug(slug: string) {
			return db().query.CategoriesTable.findFirst({
				columns: {
					id: true,
					name: true,
					slug: true,
					description: true,
					bannerImage: true,
					seoTitle: true,
					seoDescription: true,
				},
				where: and(
					eq(CategoriesTable.slug, slug),
					isNull(CategoriesTable.deletedAt),
				),
			});
		},

		async getAllCategoriesWithStock() {
			const productCount = sql<number>`count(${ProductsTable.id})::int`;

			return db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					slug: CategoriesTable.slug,
					productCount,
				})
				.from(CategoriesTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.categoryId, CategoriesTable.id),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(isNull(CategoriesTable.deletedAt))
				.groupBy(CategoriesTable.id, CategoriesTable.name, CategoriesTable.slug)
				.orderBy(desc(productCount), asc(CategoriesTable.name));
		},
	},
};
