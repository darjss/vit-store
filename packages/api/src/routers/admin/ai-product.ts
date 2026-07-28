import { match } from "dismatch";
import * as v from "valibot";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	aiBatchResultSchemas,
	aiErrorToLegacyTrpc,
	aiExtractedProductResultSchemas,
	aiExtractionProgressResultSchemas,
	aiExtractionStartResultSchemas,
	aiRegeneratedImagesResultSchemas,
	batchCreateProducts,
	extractProduct,
	finalizeProductExtraction,
	regenerateProductImages,
	scrapeAndAnalyzeProduct,
	startProductExtraction,
	translateProduct,
} from "~/operations/admin-ai/product";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const queryInputSchema = v.object({
	query: v.pipe(v.string(), v.minLength(3)),
});
const sessionInputSchema = v.object({
	sessionId: v.pipe(v.string(), v.minLength(1)),
});
const batchInputSchema = v.object({
	items: v.array(
		v.object({
			amazonUrl: v.pipe(v.string(), v.minLength(1)),
			stock: v.pipe(v.number(), v.integer()),
			price: v.pipe(v.number(), v.integer()),
		}),
	),
});
type LegacyBatchItem = {
	amazonUrl: string;
	productId: number | null;
	slug: string | null;
	status: "created" | "duplicate_flag" | "failed";
	error?: string;
};

const regenerateImagesInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	query: v.optional(v.pipe(v.string(), v.minLength(3))),
});

export function buildAiProductRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		startExtraction: proc
			.input(queryInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.startExtraction",
					"Failed to start extraction",
					() => startProductExtraction(ctx, input.query),
					aiErrorToLegacyTrpc,
				),
			),
		scrapeAndAnalyze: proc
			.input(sessionInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.scrapeAndAnalyze",
					"Failed to scrape product",
					() => scrapeAndAnalyzeProduct(ctx, input.sessionId),
					aiErrorToLegacyTrpc,
				),
			),
		translateProduct: proc
			.input(sessionInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.translateProduct",
					"Failed to translate product",
					() => translateProduct(ctx, input.sessionId),
					aiErrorToLegacyTrpc,
				),
			),
		finalizeExtraction: proc
			.input(sessionInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.finalizeExtraction",
					"Failed to finalize extraction",
					() => finalizeProductExtraction(ctx, input.sessionId),
					aiErrorToLegacyTrpc,
				),
			),
		extractProduct: proc
			.input(queryInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.extractProduct",
					"Failed to extract product",
					() => extractProduct(ctx, input.query),
					aiErrorToLegacyTrpc,
				),
			),
		batchCreateProducts: proc
			.input(batchInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.batchCreateProducts",
					"Failed to create products",
					async () =>
						(await batchCreateProducts(ctx, input)).map((batch) => ({
							...batch,
							results: batch.results.map((result) =>
								match(
									result,
									"status",
								)<LegacyBatchItem>({
									created: (item) => item,
									duplicate_flag: (item) => item,
									failed: ({ failureTag: _failureTag, ...item }) => ({
										...item,
										error: "Product processing failed",
									}),
								}),
							),
						})),
					aiErrorToLegacyTrpc,
				),
			),
		regenerateProductImages: proc
			.input(regenerateImagesInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"aiProduct.regenerateProductImages",
					"No images were uploaded. Please try again.",
					() => regenerateProductImages(ctx, input),
					aiErrorToLegacyTrpc,
				),
			),
	});
}

export const aiProductV2 = router({
	startExtraction: adminProcedure
		.input(queryInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await startProductExtraction(ctx, input.query),
				aiExtractionStartResultSchemas,
				{ operation: "admin.ai_product.start", error_layer: "provider" },
			),
		),
	scrapeAndAnalyze: adminProcedure
		.input(sessionInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await scrapeAndAnalyzeProduct(ctx, input.sessionId),
				aiExtractionProgressResultSchemas,
				{ operation: "admin.ai_product.scrape", error_layer: "provider" },
			),
		),
	translateProduct: adminProcedure
		.input(sessionInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await translateProduct(ctx, input.sessionId),
				aiExtractionProgressResultSchemas,
				{ operation: "admin.ai_product.translate", error_layer: "provider" },
			),
		),
	finalizeExtraction: adminProcedure
		.input(sessionInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await finalizeProductExtraction(ctx, input.sessionId),
				aiExtractedProductResultSchemas,
				{ operation: "admin.ai_product.finalize", error_layer: "provider" },
			),
		),
	extractProduct: adminProcedure
		.input(queryInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await extractProduct(ctx, input.query),
				aiExtractedProductResultSchemas,
				{ operation: "admin.ai_product.extract", error_layer: "provider" },
			),
		),
	batchCreateProducts: adminProcedure
		.input(batchInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await batchCreateProducts(ctx, input),
				aiBatchResultSchemas,
				{
					operation: "admin.ai_product.batch_create",
					error_layer: "domain",
					partial_success: true,
				},
			),
		),
	regenerateProductImages: adminProcedure
		.input(regenerateImagesInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await regenerateProductImages(ctx, input),
				aiRegeneratedImagesResultSchemas,
				{
					operation: "admin.ai_product.regenerate_images",
					error_layer: "provider",
				},
			),
		),
});

export const aiProduct = buildAiProductRouter(adminProcedure);
export const aiProductBot = buildAiProductRouter(botProcedure);
