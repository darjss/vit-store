import { TRPCError } from "@trpc/server";
import { addBrandSchema } from "@vit/shared";
import { Result } from "better-result";
import * as v from "valibot";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addBrand,
	catalogErrorToLegacyTrpc,
	catalogMutationResultSchemas,
	deleteBrand,
	updateBrand,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { brandQueries } from "~/queries/brands";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const brandIdSchema = v.object({ id: v.number() });

export function buildBrandsRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		getAllBrands: proc.query(async ({ ctx }) => {
			try {
				const result = await brandQueries.admin.getAllBrands();
				ctx.log.info("getAllBrands", { count: result.length });
				return result;
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getAllBrands",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error fetching brands",
					cause: error,
				});
			}
		}),
		addBrand: proc
			.input(addBrandSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addBrand",
					"Failed to add products",
					() => addBrand(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		updateBrand: proc.input(addBrandSchema).mutation(({ ctx, input }) =>
			runLegacyOperation(
				ctx,
				"updateBrand",
				"Failed to add products",
				async () => {
					const result = await updateBrand(ctx, input);
					return result.status === "error"
						? Result.err(result.error)
						: Result.ok(undefined);
				},
				catalogErrorToLegacyTrpc,
			),
		),
		deleteBrand: proc.input(brandIdSchema).mutation(({ ctx, input }) =>
			runLegacyOperation(
				ctx,
				"deleteBrand",
				"Failed to delete brand",
				async () => {
					const result = await deleteBrand(ctx, input.id);
					return result.status === "error"
						? Result.err(result.error)
						: Result.ok(undefined);
				},
				catalogErrorToLegacyTrpc,
			),
		),
	});
}

export const brandsV2 = router({
	addBrand: adminProcedure
		.input(addBrandSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addBrand(ctx, input),
				catalogMutationResultSchemas,
				{ operation: "admin.brand.add", error_layer: "domain" },
			),
		),
	updateBrand: adminProcedure
		.input(addBrandSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateBrand(ctx, input),
				catalogMutationResultSchemas,
				{ operation: "admin.brand.update", error_layer: "domain" },
			),
		),
	deleteBrand: adminProcedure
		.input(brandIdSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteBrand(ctx, input.id),
				catalogMutationResultSchemas,
				{ operation: "admin.brand.delete", error_layer: "domain" },
			),
		),
});

export const brands = buildBrandsRouter(adminProcedure);
export const brandsBot = buildBrandsRouter(botProcedure);
