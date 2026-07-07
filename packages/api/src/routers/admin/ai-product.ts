import { TRPCError } from "@trpc/server";
import {
	BRANDS_TAG,
	CATEGORIES_TAG,
	type ExtractedProductData,
	PRODUCTS_TAG,
	productTag,
} from "@vit/shared";
import { productQueries } from "@vit/api/queries";
import * as v from "valibot";
import {
	extractAndUploadProductImages,
	finalizeExtractionStage,
	runFullExtraction,
	scrapeAndAnalyzeStage,
	startExtractionStage,
	translateStage,
} from "~/lib/ai-product/pipeline";
import { purgeTags } from "~/lib/cache/workers-cache";
import { logger } from "~/lib/logger";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";

export function buildAiProductRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		startExtraction: proc
			.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
			.mutation(async ({ ctx, input }) => {
				return startExtractionStage(ctx, input.query);
			}),

		scrapeAndAnalyze: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }) => {
				return scrapeAndAnalyzeStage(ctx, input.sessionId);
			}),

		translateProduct: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }) => {
				return translateStage(ctx, input.sessionId);
			}),

		finalizeExtraction: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
				return finalizeExtractionStage(ctx, input.sessionId);
			}),

		extractProduct: proc
			.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
			.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
				return runFullExtraction(ctx, input.query);
			}),

		batchCreateProducts: proc
			.input(
				v.object({
					items: v.array(
						v.object({
							amazonUrl: v.pipe(v.string(), v.minLength(1)),
							stock: v.pipe(v.number(), v.integer()),
							price: v.pipe(v.number(), v.integer()),
						}),
					),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const results: Array<{
					amazonUrl: string;
					productId: number | null;
					slug: string | null;
					status: "created" | "duplicate_flag" | "failed";
					error?: string;
				}> = [];

				for (const item of input.items) {
					try {
						const extracted = await runFullExtraction(ctx, item.amazonUrl);
						const existingBySlug = await productQueries.admin.getProductBySlug(
							extracted.slug,
						);
						const isDuplicate = !!existingBySlug;

						const productResult = await productQueries.admin.createProduct({
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

						if (!productResult) {
							results.push({
								amazonUrl: item.amazonUrl,
								productId: null,
								slug: extracted.slug,
								status: "failed",
								error: "createProduct returned undefined",
							});
							continue;
						}

						if (extracted.images.length > 0) {
							await productQueries.admin.createProductImages(
								productResult.id,
								extracted.images.map((img, index) => ({
									url: img.url,
									isPrimary: index === 0,
								})),
							);
						}

						results.push({
							amazonUrl: item.amazonUrl,
							productId: productResult.id,
							slug: extracted.slug,
							status: isDuplicate ? "duplicate_flag" : "created",
						});
					} catch (error) {
						logger.error("aiProduct.batchCreateProducts.item.failed", error, {
							amazonUrl: item.amazonUrl,
						});
						results.push({
							amazonUrl: item.amazonUrl,
							productId: null,
							slug: null,
							status: "failed",
							error: error instanceof Error ? error.message : "unknown error",
						});
					}
				}

				const created = results.filter((r) => r.status === "created").length;
				const duplicates = results.filter(
					(r) => r.status === "duplicate_flag",
				).length;
				const failed = results.filter((r) => r.status === "failed").length;

				const createdProductTags = results
					.filter((r) => r.status !== "failed" && r.productId !== null)
					.map((r) => productTag(r.productId as number));
				if (createdProductTags.length > 0) {
					await purgeTags(ctx, [
						PRODUCTS_TAG,
						BRANDS_TAG,
						CATEGORIES_TAG,
						...createdProductTags,
					]);
				}

				return {
					results,
					summary: { total: input.items.length, created, duplicates, failed },
				};
			}),

		regenerateProductImages: proc
			.input(
				v.object({
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
					query: v.optional(v.pipe(v.string(), v.minLength(3))),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const product = await productQueries.admin.getProductById(input.productId);
				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}

				const query =
					input.query?.trim() ||
					[product.brand?.name, product.name, product.potency, product.amount]
						.filter((part): part is string => !!part && part.trim().length > 0)
						.join(" ")
						.trim();

				const result = await extractAndUploadProductImages(ctx, query);

				if (result.images.length === 0) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "No images were uploaded. Please try again.",
					});
				}

				await productQueries.admin.softDeleteProductImages(input.productId);
				await productQueries.admin.createProductImages(
					input.productId,
					result.images.map((image, index) => ({
						url: image.url,
						isPrimary: index === 0,
					})),
				);
				await purgeTags(ctx, [
					PRODUCTS_TAG,
					BRANDS_TAG,
					CATEGORIES_TAG,
					productTag(input.productId),
				]);

				return {
					images: result.images,
					sourceUrl: result.sourceUrl,
					count: result.images.length,
				};
			}),
	});
}

export const aiProduct = buildAiProductRouter(adminProcedure);
export const aiProductBot = buildAiProductRouter(botProcedure);
