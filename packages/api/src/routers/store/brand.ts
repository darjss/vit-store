import { brandQueries } from "@vit/api/queries";
import * as v from "valibot";
import {
	CATALOG_CACHE_KEYS,
	CATALOG_CACHE_TTL_SECONDS,
} from "../../lib/cache/catalog";
import { publicProcedure, router } from "../../lib/trpc";

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		const cachedBrands = await ctx.kv.get(CATALOG_CACHE_KEYS.brandsAll);
		if (cachedBrands) {
			return JSON.parse(cachedBrands) as Awaited<
				ReturnType<typeof brandQueries.store.getAllBrands>
			>;
		}

		const q = brandQueries.store;
		const brands = await q.getAllBrands();

		await ctx.kv.put(CATALOG_CACHE_KEYS.brandsAll, JSON.stringify(brands), {
			expirationTtl: CATALOG_CACHE_TTL_SECONDS,
		});

		return brands;
	}),
	getBrandById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ input }) => {
			const q = brandQueries.store;
			return await q.getBrandById(input.id);
		}),
});
