import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";
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
				.from(CategoriesTable)
				.where(isNull(CategoriesTable.deletedAt));
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
			v.object({
				name: v.pipe(v.string(), v.minLength(1, "Category name is required")),
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
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				name: v.pipe(v.string(), v.minLength(1, "Category name is required")),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id, name } = input;
				await ctx.db
					.update(CategoriesTable)
					.set({ name })
					.where(
						and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
					);
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
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { id } = input;
				await ctx.db
					.update(CategoriesTable)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
					);
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
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
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
					.where(
						and(eq(CategoriesTable.id, id), isNull(CategoriesTable.deletedAt)),
					)
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
