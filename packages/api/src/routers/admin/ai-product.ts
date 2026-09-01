import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import type { ExtractedProductData } from "@vit/shared";
import * as v from "valibot";
import {
	extractAndUploadProductImages,
	finalizeExtractionStage,
	runFullExtraction,
	scrapeAndAnalyzeStage,
	startExtractionStage,
	translateStage,
} from "~/lib/ai-product/pipeline";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { logger } from "~/lib/logger";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { adminProcedure, type baseProcedure, botProcedure, router } from "~/lib/trpc";

export function buildAiProductRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		batchCreateProducts: proc
			.input(
				v.object({
					items: v.array(
						v.object({
							amazonUrl: v.pipe(v.string(), v.minLength(1)),
							price: v.pipe(v.number(), v.integer()),
							stock: v.pipe(v.number(), v.integer()),
						}),
					),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const results: Array<{
					amazonUrl: string;
					error?: string;
					productId: number | null;
					slug: string | null;
					status: "created" | "duplicate_flag" | "failed";
				}> = [];

				for (const item of input.items) {
					try {
						const extracted = await runFullExtraction(ctx, item.amazonUrl);
						const existingBySlug = await productQueries.admin.getProductBySlug(extracted.slug);
						const isDuplicate = !!existingBySlug;

						const productResult = await productQueries.admin.createProduct({
							amount: extracted.amount,
							brandId: extracted.brandId ?? 1,
							categoryId: extracted.categoryId ?? 1,
							dailyIntake: extracted.dailyIntake,
							description: extracted.description,
							discount: 0,
							ingredients: extracted.ingredients,
							name: `${extracted.brand ? `${extracted.brand} ` : ""}${extracted.name} ${extracted.potency} ${extracted.amount}`,
							name_mn: extracted.name_mn,
							potency: extracted.potency,
							price: item.price,
							seoDescription: extracted.seoDescription,
							seoTitle: extracted.seoTitle,
							slug: extracted.slug,
							status: "draft",
							stock: item.stock,
							tags: [],
							weightGrams: extracted.weightGrams,
						});

						if (!productResult) {
							results.push({
								amazonUrl: item.amazonUrl,
								error: "createProduct returned undefined",
								productId: null,
								slug: extracted.slug,
								status: "failed",
							});
							continue;
						}

						if (extracted.images.length > 0) {
							await productQueries.admin.createProductImages(
								productResult.id,
								extracted.images.map((img, index) => ({
									isPrimary: index === 0,
									url: img.url,
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
							error: error instanceof Error ? error.message : "unknown error",
							productId: null,
							slug: null,
							status: "failed",
						});
					}
				}

				const created = results.filter((r) => r.status === "created").length;
				const duplicates = results.filter((r) => r.status === "duplicate_flag").length;
				const failed = results.filter((r) => r.status === "failed").length;

				const createdProductIds = results
					.filter((r) => r.status !== "failed" && r.productId !== null)
					.map((r) => r.productId as number);
				if (createdProductIds.length > 0) {
					await purgeCatalogCache(ctx, createdProductIds);
					scheduleProductSearchRebuild(ctx, "product_created");
				}

				return {
					results,
					summary: { created, duplicates, failed, total: input.items.length },
				};
			}),

		extractProduct: proc
			.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
			.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
				return runFullExtraction(ctx, input.query);
			}),

		finalizeExtraction: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
				return finalizeExtractionStage(ctx, input.sessionId);
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

				const result = await extractAndUploadProductImages(ctx, query, product.brand?.name);

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
						isPrimary: index === 0,
						url: image.url,
					})),
				);
				await purgeCatalogCache(ctx, [input.productId]);
				scheduleProductSearchRebuild(ctx, "product_updated");

				return {
					count: result.images.length,
					images: result.images,
					sourceUrl: result.sourceUrl,
				};
			}),

		scrapeAndAnalyze: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }) => {
				return scrapeAndAnalyzeStage(ctx, input.sessionId);
			}),

		startExtraction: proc
			.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
			.mutation(async ({ ctx, input }) => {
				return startExtractionStage(ctx, input.query);
			}),

		translateProduct: proc
			.input(v.object({ sessionId: v.pipe(v.string(), v.minLength(1)) }))
			.mutation(async ({ ctx, input }) => {
				return translateStage(ctx, input.sessionId);
			}),
	});
}

export const aiProduct = buildAiProductRouter(adminProcedure);
export const aiProductBot = buildAiProductRouter(botProcedure);
