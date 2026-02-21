import { TRPCError } from "@trpc/server";
import { categoryQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const category = router({
	getAllCategories: adminProcedure.query(async ({ ctx }) => {
		try {
			const categories = await categoryQueries.admin.getAllCategories();
			return categories;
		} catch (error) {
			ctx.log.error("getAllCategories", error);
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
				await categoryQueries.admin.createCategory(input.name);
				return { message: "Successfully added category" };
			} catch (error) {
				ctx.log.error("addCategory", error);
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
				await categoryQueries.admin.updateCategory(id, name);
				return { message: "Successfully updated category" };
			} catch (error) {
				ctx.log.error("updateCategory", error);
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
				await categoryQueries.admin.deleteCategory(id);
				return { message: "Successfully deleted category" };
			} catch (error) {
				ctx.log.error("deleteCategory", error);
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
				const category = await categoryQueries.admin.getCategoryById(id);

				if (!category) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Category not found",
					});
				}

				return category;
			} catch (error) {
				ctx.log.error("getCategoryById", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error fetching category by ID",
					cause: error,
				});
			}
		}),
});
