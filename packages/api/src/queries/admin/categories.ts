import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { CategoriesTable } from "../../db/schema";

export const adminCategories = {
	async getAllCategories() {
		return db
			.select({
				id: CategoriesTable.id,
				name: CategoriesTable.name,
				createdAt: CategoriesTable.createdAt,
				updatedAt: CategoriesTable.updatedAt,
			})
			.from(CategoriesTable)
			.where(isNull(CategoriesTable.deletedAt));
	},

	async createCategory(name: string) {
		await db.insert(CategoriesTable).values({ name });
	},

	async updateCategory(id: number, name: string) {
		await db
			.update(CategoriesTable)
			.set({ name })
			.where(
				and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
			);
	},

	async deleteCategory(id: number) {
		await db
			.update(CategoriesTable)
			.set({ deletedAt: new Date() })
			.where(
				and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
			);
	},

	async getCategoryById(id: number) {
		const result = await db
			.select({
				id: CategoriesTable.id,
				name: CategoriesTable.name,
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
};

