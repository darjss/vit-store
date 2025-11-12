import { eq } from "drizzle-orm";
import type { DB } from "../../db";
import { BrandsTable } from "../../db/schema";

export function storeBrands(db: DB) {
	return {
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
}

