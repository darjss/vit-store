import { createQueries } from "@vit/api/queries";
import * as v from "valibot";
import { publicProcedure, router } from "../../lib/trpc";

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		const q = createQueries(ctx.db).brands.store;
		return await q.getAllBrands();
	}),
	getBrandById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			const q = createQueries(ctx.db).brands.store;
			return await q.getBrandById(input.id);
		}),
});
