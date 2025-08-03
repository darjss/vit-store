import { eq } from "drizzle-orm";
import { z } from "zod";
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
			z.object({
				id: z.number(),
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
