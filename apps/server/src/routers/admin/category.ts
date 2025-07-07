import { adminProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { CategoriesTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export const category = router({
	getAllCategories: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("fetching categories");
			const categories = await ctx.db
				.select({
					id: CategoriesTable.id,
					name: CategoriesTable.name,
					createdAt: CategoriesTable.createdAt,
					updatedAt: CategoriesTable.updatedAt,
				})
				.from(CategoriesTable);
			return categories;
		} catch (error) {
			console.error("Error fetching categories:", error);
			return [];
		}
	}),

	addCategory: adminProcedure
		.input(
			z.object({
				name: z.string().min(1, "Category name is required"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.insert(CategoriesTable).values({
					name: input.name,
				});
				return { message: "Successfully added category" };
			} catch (error) {
				console.error("Error adding category:", error);
				return { message: "Operation failed", error: error };
			}
		}),

	updateCategory: adminProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1, "Category name is required"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id, name } = input;
				await ctx.db
					.update(CategoriesTable)
					.set({ name })
					.where(eq(CategoriesTable.id, id));
				return { message: "Successfully updated category" };
			} catch (error) {
				console.error("Error updating category:", error);
				return { message: "Operation failed", error: error };
			}
		}),

	deleteCategory: adminProcedure
		.input(
			z.object({
				id: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id } = input;
				await ctx.db.delete(CategoriesTable).where(eq(CategoriesTable.id, id));
				return { message: "Successfully deleted category" };
			} catch (error) {
				console.error("Error deleting category:", error);
				return { message: "Operation failed", error: error };
			}
		}),

	getCategoryById: adminProcedure
		.input(
			z.object({
				id: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { id } = input;
				const category = await ctx.db
					.select({
						id: CategoriesTable.id,
						name: CategoriesTable.name,
						createdAt: CategoriesTable.createdAt,
						updatedAt: CategoriesTable.updatedAt,
					})
					.from(CategoriesTable)
					.where(eq(CategoriesTable.id, id))
					.limit(1);

				return category[0] || null;
			} catch (error) {
				console.error("Error fetching category by ID:", error);
				return null;
			}
		}),
});
