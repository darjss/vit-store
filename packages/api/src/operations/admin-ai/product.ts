import {
	aiBatchResultSchema,
	aiExtractionProgressSchema,
	aiExtractionStartSchema,
	aiOperationErrorSchema,
	extractedProductDataSchema,
	regeneratedProductImagesSchema,
	type AiOperationError,
} from "@vit/shared";
import { Result } from "better-result";
import { match } from "dismatch";
import type { Context } from "~/lib/context";
import {
	extractAndUploadProductImages,
	finalizeExtractionStage,
	runFullExtraction,
	scrapeAndAnalyzeStage,
	startExtractionStage,
	translateStage,
} from "~/lib/ai-product/pipeline";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { productQueries } from "~/queries/products";
import type { LegacyTrpcError } from "~/result/legacy-trpc";
import { aiInvalidSource, aiNoUsableImages } from "~/errors/factories/admin";

export const aiExtractionStartResultSchemas = {
	value: aiExtractionStartSchema,
	error: aiOperationErrorSchema,
};
export const aiExtractionProgressResultSchemas = {
	value: aiExtractionProgressSchema,
	error: aiOperationErrorSchema,
};
export const aiExtractedProductResultSchemas = {
	value: extractedProductDataSchema,
	error: aiOperationErrorSchema,
};
export const aiBatchResultSchemas = {
	value: aiBatchResultSchema,
	error: aiOperationErrorSchema,
};
export const aiRegeneratedImagesResultSchemas = {
	value: regeneratedProductImagesSchema,
	error: aiOperationErrorSchema,
};

export const startProductExtraction = startExtractionStage;
export const scrapeAndAnalyzeProduct = scrapeAndAnalyzeStage;
export const translateProduct = translateStage;
export const finalizeProductExtraction = finalizeExtractionStage;
export const extractProduct = runFullExtraction;

type BatchInput = {
	items: Array<{ amazonUrl: string; stock: number; price: number }>;
};

type BatchResult =
	| {
			amazonUrl: string;
			productId: number;
			slug: string;
			status: "created";
	  }
	| {
			amazonUrl: string;
			productId: number;
			slug: string;
			status: "duplicate_flag";
	  }
	| {
			amazonUrl: string;
			productId: null;
			slug: null;
			status: "failed";
			failureTag: AiOperationError["_tag"];
	  };

export const batchCreateProducts = async (ctx: Context, input: BatchInput) => {
	const results: BatchResult[] = [];

	for (const item of input.items) {
		const extraction = await runFullExtraction(ctx, item.amazonUrl);
		if (extraction.status === "error") {
			results.push({
				amazonUrl: item.amazonUrl,
				productId: null,
				slug: null,
				status: "failed",
				failureTag: extraction.error._tag,
			});
			continue;
		}
		const extracted = extraction.value;
		const duplicate = await productQueries.admin.getProductBySlug(
			extracted.slug,
		);
		const product = await productQueries.admin.createProduct({
			name: `${extracted.brand ? `${extracted.brand} ` : ""}${extracted.name} ${extracted.potency} ${extracted.amount}`,
			slug: extracted.slug,
			description: extracted.description,
			discount: 0,
			amount: extracted.amount,
			potency: extracted.potency,
			stock: item.stock,
			price: item.price,
			dailyIntake: extracted.dailyIntake,
			categoryId: extracted.categoryId ?? 1,
			brandId: extracted.brandId ?? 1,
			status: "draft",
			name_mn: extracted.name_mn,
			ingredients: extracted.ingredients,
			tags: [],
			seoTitle: extracted.seoTitle,
			seoDescription: extracted.seoDescription,
			weightGrams: extracted.weightGrams,
		});
		if (!product) throw new Error("Batch product insert returned no row");
		await productQueries.admin.createProductImages(
			product.id,
			extracted.images.map((image, index) => ({
				url: image.url,
				isPrimary: index === 0,
			})),
		);
		results.push(
			duplicate
				? {
						amazonUrl: item.amazonUrl,
						productId: product.id,
						slug: extracted.slug,
						status: "duplicate_flag",
					}
				: {
						amazonUrl: item.amazonUrl,
						productId: product.id,
						slug: extracted.slug,
						status: "created",
					},
		);
	}

	const summary = {
		total: input.items.length,
		created: 0,
		duplicates: 0,
		failed: 0,
	};
	for (const result of results) {
		match(
			result,
			"status",
		)({
			created: () => {
				summary.created += 1;
			},
			duplicate_flag: () => {
				summary.duplicates += 1;
			},
			failed: () => {
				summary.failed += 1;
			},
		});
	}
	const createdProductIds = results.flatMap((result) =>
		result.status !== "failed" && result.productId !== null
			? [result.productId]
			: [],
	);
	if (createdProductIds.length > 0) {
		await purgeCatalogCache(ctx, createdProductIds);
		scheduleProductSearchRebuild(ctx, "product_created");
	}
	return Result.ok({ results, summary });
};

export const regenerateProductImages = async (
	ctx: Context,
	input: { productId: number; query?: string },
) => {
	const product = await productQueries.admin.getProductById(input.productId);
	if (!product) return Result.err(aiInvalidSource());
	const query =
		input.query?.trim() ||
		[product.brand?.name, product.name, product.potency, product.amount]
			.filter((part): part is string => !!part && part.trim().length > 0)
			.join(" ")
			.trim();
	const extracted = await extractAndUploadProductImages(ctx, query);
	if (extracted.status === "error") return extracted;
	if (extracted.value.images.length === 0) {
		return Result.err(aiNoUsableImages());
	}
	await productQueries.admin.softDeleteProductImages(input.productId);
	await productQueries.admin.createProductImages(
		input.productId,
		extracted.value.images.map((image, index) => ({
			url: image.url,
			isPrimary: index === 0,
		})),
	);
	await purgeCatalogCache(ctx, [input.productId]);
	scheduleProductSearchRebuild(ctx, "product_updated");
	return Result.ok({
		images: extracted.value.images,
		sourceUrl: extracted.value.sourceUrl,
		count: extracted.value.images.length,
	});
};

export const aiErrorToLegacyTrpc = (error: AiOperationError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		InvalidSource: () => ({
			code: "NOT_FOUND",
			message: "Could not find product on Amazon. Try a direct URL.",
		}),
		ExtractionFailed: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to extract product",
		}),
		InvalidModelOutput: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Invalid model output",
		}),
		ProductResolutionRequired: () => ({
			code: "BAD_REQUEST",
			message: "Product resolution required",
		}),
		NoUsableImages: () => ({
			code: "BAD_REQUEST",
			message: "No images were uploaded. Please try again.",
		}),
		ProviderUnavailable: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "AI provider unavailable",
		}),
	});
