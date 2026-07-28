import { TRPCError } from "@trpc/server";
import { addCategorySchema } from "@vit/shared";
import * as v from "valibot";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addCategory,
	catalogErrorToLegacyTrpc,
	catalogMutationResultSchemas,
	deleteCategory,
	updateCategory,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { categoryQueries } from "~/queries/categories";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const categoryIdSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export function buildCategoryRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		getAllCategories: proc.query(async ({ ctx }) => {
			try {
				return await categoryQueries.admin.getAllCategories();
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getAllCategories",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error fetching categories",
					cause: error,
				});
			}
		}),
		addCategory: proc
			.input(addCategorySchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addCategory",
					"Error adding category",
					() => addCategory(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		updateCategory: proc
			.input(addCategorySchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateCategory",
					"Error updating category",
					() => updateCategory(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		deleteCategory: proc
			.input(categoryIdSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deleteCategory",
					"Error deleting category",
					() => deleteCategory(ctx, input.id),
					catalogErrorToLegacyTrpc,
				),
			),
		getCategoryById: proc
			.input(categoryIdSchema)
			.query(async ({ ctx, input }) => {
				try {
					const category = await categoryQueries.admin.getCategoryById(
						input.id,
					);
					if (!category) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Category not found",
						});
					}
					return category;
				} catch (error) {
					if (error instanceof TRPCError) throw error;
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{
							event: "getCategoryById",
						},
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Error fetching category by ID",
						cause: error,
					});
				}
			}),
	});
}

export const categoryV2 = router({
	addCategory: adminProcedure
		.input(addCategorySchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addCategory(ctx, input),
				catalogMutationResultSchemas,
				{ operation: "admin.category.add", error_layer: "domain" },
			),
		),
	updateCategory: adminProcedure
		.input(addCategorySchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateCategory(ctx, input),
				catalogMutationResultSchemas,
				{ operation: "admin.category.update", error_layer: "domain" },
			),
		),
	deleteCategory: adminProcedure
		.input(categoryIdSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteCategory(ctx, input.id),
				catalogMutationResultSchemas,
				{ operation: "admin.category.delete", error_layer: "domain" },
			),
		),
});

export const category = buildCategoryRouter(adminProcedure);
export const categoryBot = buildCategoryRouter(botProcedure);
