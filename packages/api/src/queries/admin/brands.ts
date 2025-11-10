import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { BrandsTable } from "../../db/schema";

export const adminBrands = {
	async getAllBrands() {
		return db
			.select()
			.from(BrandsTable)
			.where(isNull(BrandsTable.deletedAt));
	},

	async createBrand(data: { name: string; logoUrl: string }) {
		await db.insert(BrandsTable).values(data);
	},

	async updateBrand(id: number, data: { name: string; logoUrl: string }) {
		await db
			.update(BrandsTable)
			.set(data)
			.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
	},

	async deleteBrand(id: number) {
		await db
			.update(BrandsTable)
			.set({ deletedAt: new Date() })
			.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
	},
};

