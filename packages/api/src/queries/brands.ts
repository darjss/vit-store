import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { BrandsTable } from "../db/schema";

export const brandQueries = {
	admin: {
		async getAllBrands() {
			return db()
				.select()
				.from(BrandsTable)
				.where(isNull(BrandsTable.deletedAt));
		},

		async createBrand(data: { name: string; logoUrl: string }) {
			const result = await db().insert(BrandsTable).values(data).returning();
			return result[0];
		},

		async updateBrand(id: number, data: { name: string; logoUrl: string }) {
			await db()
				.update(BrandsTable)
				.set(data)
				.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
		},

		async deleteBrand(id: number) {
			await db()
				.update(BrandsTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
		},
	},

	store: {
		async getAllBrands() {
			return db().query.BrandsTable.findMany({
				columns: {
					id: true,
					name: true,
					logoUrl: true,
				},
			});
		},

		async getBrandById(id: number) {
			return db().query.BrandsTable.findFirst({
				columns: {
					id: true,
					name: true,
					logoUrl: true,
				},
				where: eq(BrandsTable.id, id),
			});
		},
	},
};
