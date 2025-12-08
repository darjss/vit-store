import { publicProcedure, router } from "@/lib/trpc";
import { createQueries } from "@/queries";

export const category = router({
	getAllCategoryNames: publicProcedure.query(async ({ ctx }) => {
		const q = createQueries(ctx.db).categories.store;
		return await q.getAllCategoryNames();
	}),

	getAllCategories: publicProcedure.query(async ({ ctx }) => {
		const q = createQueries(ctx.db).categories.store;
		return await q.getAllCategories();
	}),
});
