import {
	BRANDS_TAG,
	brandLookupResultSchemas,
	brandTag,
	CACHE_POLICY,
	serializeResult,
} from "@vit/shared";
import type { Result } from "better-result";
import * as v from "valibot";
import { markCacheable } from "~/lib/cache/workers-cache";
import { publicProcedure, router } from "~/lib/trpc";
import {
	getAllBrandsWithStockOperation,
	getBrandBySlugOperation,
} from "~/operations/product/catalog";
import { brandQueries } from "~/queries/brands";

const brandBySlugInput = v.object({
	slug: v.pipe(v.string(), v.minLength(1)),
});

const valueOrNull = <Value, Failure>(result: Result<Value, Failure>) =>
	result.match<Value | null>({ ok: (value) => value, err: () => null });

const markBrandLookupCache = (
	ctx: Parameters<typeof markCacheable>[0],
	brand: { id: number } | null,
) =>
	markCacheable(
		ctx,
		CACHE_POLICY.brands,
		brand ? [BRANDS_TAG, brandTag(brand.id)] : [BRANDS_TAG],
	);

export const brand = router({
	getAllBrands: publicProcedure.query(async ({ ctx }) => {
		const brands = await brandQueries.store.getAllBrands();
		markCacheable(ctx, CACHE_POLICY.brands, [BRANDS_TAG]);
		return brands;
	}),
	getAllBrandsWithStock: publicProcedure.query(async ({ ctx }) => {
		const brands = await getAllBrandsWithStockOperation();
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
		.input(brandBySlugInput)
		.query(async ({ ctx, input }) => {
			const result = await getBrandBySlugOperation(input.slug);
			const brand = valueOrNull(result);
			markBrandLookupCache(ctx, brand);
			return brand;
		}),
});

export const brandV2Router = router({
	getAllBrandsWithStock: publicProcedure.query(async ({ ctx }) => {
		const brands = await getAllBrandsWithStockOperation();
		markCacheable(ctx, CACHE_POLICY.brands, [BRANDS_TAG]);
		return brands;
	}),
	getBrandBySlug: publicProcedure
		.input(brandBySlugInput)
		.query(async ({ ctx, input }) => {
			const result = await getBrandBySlugOperation(input.slug);
			markBrandLookupCache(ctx, valueOrNull(result));
			return serializeResult(result, brandLookupResultSchemas);
		}),
});
