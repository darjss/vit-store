import * as v from "valibot";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addImage,
	catalogErrorToLegacyTrpc,
	catalogMutationResultSchemas,
	deleteImage,
	setPrimaryImage,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const addImageInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	url: v.pipe(v.string(), v.url()),
});
const imageIdSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
const setPrimaryImageInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	imageId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export function buildImageRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addImage: proc
			.input(addImageInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addImage",
					"Operation failed",
					() => addImage(input),
					catalogErrorToLegacyTrpc,
				),
			),
		deleteImage: proc
			.input(imageIdSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deleteImage",
					"Operation failed",
					() => deleteImage(input.id),
					catalogErrorToLegacyTrpc,
				),
			),
		setPrimaryImage: proc
			.input(setPrimaryImageInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"setPrimaryImage",
					"Operation failed",
					() => setPrimaryImage(input),
					catalogErrorToLegacyTrpc,
				),
			),
	});
}

export const imageV2 = router({
	addImage: adminProcedure
		.input(addImageInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addImage(input),
				catalogMutationResultSchemas,
				{ operation: "admin.image.add", error_layer: "domain" },
			),
		),
	deleteImage: adminProcedure
		.input(imageIdSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteImage(input.id),
				catalogMutationResultSchemas,
				{ operation: "admin.image.delete", error_layer: "domain" },
			),
		),
	setPrimaryImage: adminProcedure
		.input(setPrimaryImageInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await setPrimaryImage(input),
				catalogMutationResultSchemas,
				{ operation: "admin.image.set_primary", error_layer: "domain" },
			),
		),
});

export const image = buildImageRouter(adminProcedure);
export const imageBot = buildImageRouter(botProcedure);
