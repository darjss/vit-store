import { categoryQueries } from "@vit/api/queries";
import * as v from "valibot";
import {
	CATALOG_CACHE_KEYS,
	CATALOG_CACHE_TTL_SECONDS,
} from "~/lib/cache/catalog";
import type { Context } from "~/lib/context";
import { publicProcedure, router } from "~/lib/trpc";

const getCachedCategories = async (ctx: Context) => {
	const cachedCategories = await ctx.kv.get(CATALOG_CACHE_KEYS.categoriesAll);
	if (cachedCategories) {
		return JSON.parse(cachedCategories) as Awaited<
			ReturnType<typeof categoryQueries.store.getAllCategories>
		>;
	}

	const categories = await categoryQueries.store.getAllCategories();

	await ctx.kv.put(
		CATALOG_CACHE_KEYS.categoriesAll,
		JSON.stringify(categories),
		{
			expirationTtl: CATALOG_CACHE_TTL_SECONDS,
		},
	);

	return categories;
};

const getCachedCategoriesWithStock = async (ctx: Context) => {
	const cacheKey = `${CATALOG_CACHE_KEYS.categoriesAll}:stock`;
	const cachedCategories = await ctx.kv.get(cacheKey);
	if (cachedCategories) {
		return JSON.parse(cachedCategories) as Awaited<
			ReturnType<typeof categoryQueries.store.getAllCategoriesWithStock>
		>;
	}

	const categories = await categoryQueries.store.getAllCategoriesWithStock();

	await ctx.kv.put(cacheKey, JSON.stringify(categories), {
		expirationTtl: CATALOG_CACHE_TTL_SECONDS,
	});

	return categories;
};

export const category = router({
	getAllCategoryNames: publicProcedure.query(async ({ ctx }) => {
		const categories = await getCachedCategories(ctx);
		return categories.map((category) => category.name);
	}),

	getAllCategories: publicProcedure.query(async ({ ctx }) => {
		return await getCachedCategories(ctx);
	}),

	getAllCategoriesWithStock: publicProcedure.query(async ({ ctx }) => {
		return await getCachedCategoriesWithStock(ctx);
	}),

	getCategoryBySlug: publicProcedure
		.input(
			v.object({
				slug: v.pipe(v.string(), v.minLength(1)),
			}),
		)
		.query(async ({ input }) => {
			const q = categoryQueries.store;
			return await q.getCategoryBySlug(input.slug);
		}),
});
