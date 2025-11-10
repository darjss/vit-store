import { TRPCError } from "@trpc/server";
import { adminQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const category = router({
	getAllCategories: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("fetching categories");
			const categories = await adminQueries.getAllCategories();
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
				await adminQueries.createCategory(input.name);
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
				await adminQueries.updateCategory(id, name);
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
				await adminQueries.deleteCategory(id);
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
				const category = await adminQueries.getCategoryById(id);

				if (!category) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Category not found",
					});
				}

				return category;
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
