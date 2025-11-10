import { storeQueries } from "@vit/api/queries";
import * as v from "valibot";
import { publicProcedure, router } from "../../lib/trpc";

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		return await storeQueries.getAllBrands();
	}),
	getBrandById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input, ctx }) => {
			return await storeQueries.getBrandById(input.id);
		}),
});
