import { brandQueries } from "@vit/api/queries";
import { BRANDS_TAG, brandTag, CACHE_POLICY } from "@vit/shared";
import * as v from "valibot";
import { markCacheable } from "~/lib/cache/workers-cache";
import { publicProcedure, router } from "~/lib/trpc";

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		const brands = await brandQueries.store.getAllBrands();
		markCacheable(ctx, CACHE_POLICY.brands, [BRANDS_TAG]);
		return brands;
	}),

	getAllBrandsWithStock: publicProcedure.query(async ({ ctx }) => {
		const brands = await brandQueries.store.getAllBrandsWithStock();
		markCacheable(ctx, CACHE_POLICY.brands, [BRANDS_TAG]);
		return brands;
	}),

	getBrandById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const brand = await brandQueries.store.getBrandById(input.id);
			markCacheable(ctx, CACHE_POLICY.brands, [BRANDS_TAG, brandTag(input.id)]);
			return brand;
		}),
	getBrandBySlug: publicProcedure
		.input(
			v.object({
				slug: v.pipe(v.string(), v.minLength(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const brand = await brandQueries.store.getBrandBySlug(input.slug);
			markCacheable(
				ctx,
				CACHE_POLICY.brands,
				brand ? [BRANDS_TAG, brandTag(brand.id)] : [BRANDS_TAG],
			);
			return brand;
		}),
});
