import {
	CACHE_POLICY,
	CATEGORIES_TAG,
	categoryLookupResultSchemas,
	categoryTag,
	serializeResult,
} from "@vit/shared";
import type { Result } from "better-result";
import * as v from "valibot";
import { markCacheable } from "~/lib/cache/workers-cache";
import { publicProcedure, router } from "~/lib/trpc";
import {
	getAllCategoriesOperation,
	getAllCategoriesWithStockOperation,
	getCategoryBySlugOperation,
} from "~/operations/product/catalog";
import { categoryQueries } from "~/queries/categories";

const categoryBySlugInput = v.object({
	slug: v.pipe(v.string(), v.minLength(1)),
});

const valueOrNull = <Value, Failure>(result: Result<Value, Failure>) =>
	result.match<Value | null>({ ok: (value) => value, err: () => null });

const markCategoryLookupCache = (
	ctx: Parameters<typeof markCacheable>[0],
	category: { id: number } | null,
) =>
	markCacheable(
		ctx,
		CACHE_POLICY.categories,
		category ? [CATEGORIES_TAG, categoryTag(category.id)] : [CATEGORIES_TAG],
	);

export const category = router({
	getAllCategoryNames: publicProcedure.query(async ({ ctx }) => {
		const categories = await categoryQueries.store.getAllCategories();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories.map((category) => category.name);
	}),
	getAllCategories: publicProcedure.query(async ({ ctx }) => {
		const categories = await getAllCategoriesOperation();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),
	getAllCategoriesWithStock: publicProcedure.query(async ({ ctx }) => {
		const categories = await getAllCategoriesWithStockOperation();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),
	getCategoryBySlug: publicProcedure
		.input(categoryBySlugInput)
		.query(async ({ ctx, input }) => {
			const result = await getCategoryBySlugOperation(input.slug);
			const category = valueOrNull(result);
			markCategoryLookupCache(ctx, category);
			return category;
		}),
});

export const categoryV2Router = router({
	getAllCategories: publicProcedure.query(async ({ ctx }) => {
		const categories = await getAllCategoriesOperation();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),
	getAllCategoriesWithStock: publicProcedure.query(async ({ ctx }) => {
		const categories = await getAllCategoriesWithStockOperation();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),
	getCategoryBySlug: publicProcedure
		.input(categoryBySlugInput)
		.query(async ({ ctx, input }) => {
			const result = await getCategoryBySlugOperation(input.slug);
			markCategoryLookupCache(ctx, valueOrNull(result));
			return serializeResult(result, categoryLookupResultSchemas);
		}),
});
