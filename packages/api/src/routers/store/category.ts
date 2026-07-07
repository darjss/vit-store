import { categoryQueries } from "@vit/api/queries";
import { CACHE_POLICY, CATEGORIES_TAG, categoryTag } from "@vit/shared";
import * as v from "valibot";
import { markCacheable } from "~/lib/cache/workers-cache";
import { publicProcedure, router } from "~/lib/trpc";

export const category = router({
	getAllCategoryNames: publicProcedure.query(async ({ ctx }) => {
		const categories = await categoryQueries.store.getAllCategories();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories.map((category) => category.name);
	}),

	getAllCategories: publicProcedure.query(async ({ ctx }) => {
		const categories = await categoryQueries.store.getAllCategories();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),

	getAllCategoriesWithStock: publicProcedure.query(async ({ ctx }) => {
		const categories = await categoryQueries.store.getAllCategoriesWithStock();
		markCacheable(ctx, CACHE_POLICY.categories, [CATEGORIES_TAG]);
		return categories;
	}),

	getCategoryBySlug: publicProcedure
		.input(
			v.object({
				slug: v.pipe(v.string(), v.minLength(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const category = await categoryQueries.store.getCategoryBySlug(
				input.slug,
			);
			markCacheable(
				ctx,
				CACHE_POLICY.categories,
				category
					? [CATEGORIES_TAG, categoryTag(category.id)]
					: [CATEGORIES_TAG],
			);
			return category;
		}),
});
