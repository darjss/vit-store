import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CategoriesTable } from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";

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
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Error fetching categories",
				cause: error,
			});
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error adding category",
					cause: error,
				});
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error updating category",
					cause: error,
				});
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error deleting category",
					cause: error,
				});
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

				if (!category[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Category not found",
					});
				}

				return category[0];
			} catch (error) {
				console.error("Error fetching category by ID:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error fetching category by ID",
					cause: error,
				});
			}
		}),
});
