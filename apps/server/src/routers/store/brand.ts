import { eq } from "drizzle-orm";
import * as v from "valibot";
import { BrandsTable } from "@/db/schema";
import { publicProcedure, router } from "@/lib/trpc";

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		return await ctx.db.query.BrandsTable.findMany({
			columns: {
				id: true,
				name: true,
				logoUrl: true,
			},
		});
	}),
	getBrandById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const result = await ctx.db.query.BrandsTable.findFirst({
				columns: {
					id: true,
					name: true,
					logoUrl: true,
				},
				where: eq(BrandsTable.id, input.id),
			});
			if (result === null || result === undefined) {
				return null;
			}
			return result;
		}),
});
