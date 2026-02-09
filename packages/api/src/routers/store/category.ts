import { categoryQueries } from "@vit/api/queries";
import { publicProcedure, router } from "../../lib/trpc";

export const category = router({
	getAllCategoryNames: publicProcedure.query(async () => {
		const q = categoryQueries.store;
		return await q.getAllCategoryNames();
	}),

	getAllCategories: publicProcedure.query(async () => {
		const q = categoryQueries.store;
		return await q.getAllCategories();
	}),
});
