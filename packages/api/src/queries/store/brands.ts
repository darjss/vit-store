import { eq } from "drizzle-orm";
import { db } from "../../db";
import { BrandsTable } from "../../db/schema";

export const storeBrands = {
	async getAllBrands() {
		return db.query.BrandsTable.findMany({
			columns: {
				id: true,
				name: true,
				logoUrl: true,
			},
		});
	},

	async getBrandById(id: number) {
		return db.query.BrandsTable.findFirst({
			columns: {
				id: true,
				name: true,
				logoUrl: true,
			},
			where: eq(BrandsTable.id, id),
		});
	},
};

