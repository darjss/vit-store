import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { CategoriesTable, ProductsTable } from "~/db/schema";

export const categoryQueries = {
	admin: {
		async createCategory(data: {
			bannerImage?: string | null;
			description?: string | null;
			name: string;
			seoDescription?: string | null;
			seoTitle?: string | null;
			slug: string;
		}) {
			await db().insert(CategoriesTable).values(data);
		},

		async deleteCategory(id: number) {
			await db()
				.update(CategoriesTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)));
		},

		async getAllCategories() {
			return db()
				.select({
					bannerImage: CategoriesTable.bannerImage,
					createdAt: CategoriesTable.createdAt,
					description: CategoriesTable.description,
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					seoDescription: CategoriesTable.seoDescription,
					seoTitle: CategoriesTable.seoTitle,
					slug: CategoriesTable.slug,
					updatedAt: CategoriesTable.updatedAt,
				})
				.from(CategoriesTable)
				.where(isNull(CategoriesTable.deletedAt));
		},

		async getCategoryById(id: number) {
			const result = await db()
				.select({
					bannerImage: CategoriesTable.bannerImage,
					createdAt: CategoriesTable.createdAt,
					description: CategoriesTable.description,
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					seoDescription: CategoriesTable.seoDescription,
					seoTitle: CategoriesTable.seoTitle,
					slug: CategoriesTable.slug,
					updatedAt: CategoriesTable.updatedAt,
				})
				.from(CategoriesTable)
				.where(and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)))
				.limit(1);
			return result[0] || null;
		},

		async updateCategory(
			id: number,
			data: {
				bannerImage?: string | null;
				description?: string | null;
				name: string;
				seoDescription?: string | null;
				seoTitle?: string | null;
				slug: string;
			},
		) {
			await db()
				.update(CategoriesTable)
				.set(data)
				.where(and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)));
		},
	},

	store: {
		async getAllCategories() {
			const productCount = sql<number>`count(${ProductsTable.id})::int`;

			return db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					productCount,
					slug: CategoriesTable.slug,
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

		async getAllCategoriesWithStock() {
			const productCount = sql<number>`count(${ProductsTable.id})::int`;

			return db()
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					productCount,
					slug: CategoriesTable.slug,
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

		async getAllCategoryNames() {
			const categories = await db().query.CategoriesTable.findMany({
				columns: {
					name: true,
				},
			});
			return categories.map((category) => category.name);
		},

		async getCategoryBySlug(slug: string) {
			return db().query.CategoriesTable.findFirst({
				columns: {
					bannerImage: true,
					description: true,
					id: true,
					name: true,
					seoDescription: true,
					seoTitle: true,
					slug: true,
				},
				where: and(eq(CategoriesTable.slug, slug), isNull(CategoriesTable.deletedAt)),
			});
		},
	},
};
