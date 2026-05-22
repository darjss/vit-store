import Firecrawl from "@mendable/firecrawl-js";
import { TRPCError } from "@trpc/server";
import type {
	AiProductSessionState,
	ExtractedProductData,
	ExtractionStepId,
} from "@vit/shared";
import { brandQueries, categoryQueries } from "@vit/api/queries";
import {
	assembleExtractedProductData,
	noteImageUploadIssues,
} from "~/lib/ai-product/assemble";
import {
	resolveProductUrl,
	scrapeAmazonProduct,
	searchAmazonProduct,
} from "~/lib/ai-product/amazon-scrape";
import { isAmazonUrl } from "~/lib/ai-product/amazon-url";
import { resolveOrCreateBrandId } from "~/lib/ai-product/brand-resolve";
import {
	analyzeProductImages,
	filterProductImages,
} from "~/lib/ai-product/image-pipeline";
import {
	createInitialSession,
	createSessionId,
	deleteSession,
	readSession,
	writeSession,
} from "~/lib/ai-product/session";
import { translateAndStructureProduct } from "~/lib/ai-product/translate";
import { uploadImagesToR2 } from "~/lib/ai-product/upload-r2";
import { calculatePriceMntFromUsd } from "~/lib/ai/pricing";
import type { Context } from "~/lib/context";
import { logger } from "~/lib/logger";

function getFirecrawl(ctx: Context): Firecrawl {
	const firecrawlApiKey = ctx.c.env.FIRECRAWL_API_KEY;
	if (!firecrawlApiKey) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Firecrawl API key not configured",
		});
	}
	return new Firecrawl({ apiKey: firecrawlApiKey });
}

function trpcFromError(error: unknown): never {
	if (error instanceof TRPCError) throw error;
	if (error instanceof Error && error.message.includes("Amazon")) {
		throw new TRPCError({ code: "NOT_FOUND", message: error.message });
	}
	throw error;
}

export async function startExtractionStage(
	ctx: Context,
	query: string,
): Promise<{ sessionId: string; step: ExtractionStepId; productUrl: string }> {
	const sessionId = createSessionId();
	const session = createInitialSession(query);

	try {
		const firecrawl = getFirecrawl(ctx);
		const productUrl = await resolveProductUrl(firecrawl, query);
		session.productUrl = productUrl;
		session.status = "extracting";
		await writeSession(sessionId, session);

		return { sessionId, step: "searching", productUrl };
	} catch (error) {
		session.status = "failed";
		session.errors.push(
			error instanceof Error ? error.message : "URL resolution failed",
		);
		await writeSession(sessionId, session);
		trpcFromError(error);
	}
}

export async function scrapeAndAnalyzeStage(
	ctx: Context,
	sessionId: string,
): Promise<{ sessionId: string; step: ExtractionStepId }> {
	const session = await readSession(sessionId);
	if (!session.productUrl) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Extraction session missing product URL",
		});
	}

	const errors = [...session.errors];
	let extractionStatus = session.extractionStatus ?? "success";

	try {
		const firecrawl = getFirecrawl(ctx);
		const scrapeResult = await scrapeAmazonProduct(firecrawl, session.productUrl);
		if (!scrapeResult?.extracted.title) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to scrape product page.",
			});
		}

		session.scraped = scrapeResult.extracted;
		if (typeof scrapeResult.extracted.priceUsd === "number") {
			session.calculatedPriceMnt = calculatePriceMntFromUsd(
				scrapeResult.extracted.priceUsd,
			);
		} else {
			errors.push("Could not extract Amazon USD price.");
			extractionStatus = "partial";
		}

		const imageFilter = await filterProductImages(
			scrapeResult.extracted.title,
			scrapeResult.extracted.images,
		);
		session.filteredImages = imageFilter.images;

		if (imageFilter.images.length === 0 && scrapeResult.extracted.images.length > 0) {
			errors.push("Image filtering removed all candidates.");
			extractionStatus = "partial";
		}

		if (imageFilter.images.length > 0) {
			session.vision = await analyzeProductImages(imageFilter.images);
			if (
				session.vision.ingredients.length === 0 &&
				scrapeResult.extracted.ingredients.length === 0
			) {
				errors.push("Could not extract ingredients from images.");
				extractionStatus = "partial";
			}
		} else {
			session.vision = {
				ingredients: [],
				servingSize: null,
				dailyIntake: null,
				supplementFacts: null,
			};
			errors.push("No product images found.");
			extractionStatus = "partial";
		}

		session.errors = errors;
		session.extractionStatus = extractionStatus;
		session.status = "translating";
		await writeSession(sessionId, session);

		return { sessionId, step: "extracting" };
	} catch (error) {
		session.status = "failed";
		session.errors = [
			...errors,
			error instanceof Error ? error.message : "Scrape and analyze failed",
		];
		await writeSession(sessionId, session);
		throw error;
	}
}

export async function translateStage(
	ctx: Context,
	sessionId: string,
): Promise<{ sessionId: string; step: ExtractionStepId }> {
	const session = await readSession(sessionId);
	if (!session.scraped || !session.vision) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Extraction session missing scraped data",
		});
	}

	const errors = [...session.errors];
	let extractionStatus = session.extractionStatus ?? "success";

	const [allBrands, allCategories] = await Promise.all([
		brandQueries.admin.getAllBrands(),
		categoryQueries.admin.getAllCategories(),
	]);

	const structuredData = await translateAndStructureProduct(
		session.scraped,
		session.vision,
		allBrands.map((b) => ({ id: b.id, name: b.name })),
		allCategories.map((c) => ({ id: c.id, name: c.name })),
	);

	const validBrandIds = new Set(allBrands.map((b) => b.id));
	const validCategoryIds = new Set(allCategories.map((c) => c.id));
	const matchedBrandId =
		structuredData?.brandId != null && validBrandIds.has(structuredData.brandId)
			? structuredData.brandId
			: null;
	const matchedCategoryId =
		structuredData?.categoryId != null &&
		validCategoryIds.has(structuredData.categoryId)
			? structuredData.categoryId
			: null;

	if (!structuredData) {
		errors.push("Translation failed. Using raw data.");
		extractionStatus = "partial";
	}

	const finalBrandId =
		matchedBrandId ??
		(await resolveOrCreateBrandId(
			session.scraped.brand,
			allBrands.map((b) => ({ id: b.id, name: b.name })),
		));

	session.translation = structuredData ?? undefined;
	session.brandId = finalBrandId;
	session.categoryId = matchedCategoryId;
	session.errors = errors;
	session.extractionStatus = extractionStatus;
	session.status = "uploading";
	await writeSession(sessionId, session);

	return { sessionId, step: "translating" };
}

export async function finalizeExtractionStage(
	ctx: Context,
	sessionId: string,
): Promise<ExtractedProductData> {
	const session = await readSession(sessionId);
	if (!session.scraped || !session.vision || !session.productUrl) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Extraction session incomplete",
		});
	}

	const errors = [...session.errors];
	let extractionStatus = session.extractionStatus ?? "success";
	const filteredImages = session.filteredImages ?? [];

	let uploadedImages: { url: string }[] = [];
	if (filteredImages.length > 0) {
		uploadedImages = await uploadImagesToR2(filteredImages, ctx);
		const uploadStatus = noteImageUploadIssues(
			filteredImages,
			uploadedImages,
			errors,
		);
		if (uploadStatus === "partial") {
			extractionStatus = "partial";
		}
	}

	const result = assembleExtractedProductData({
		extractedData: session.scraped,
		visionData: session.vision,
		structuredData: session.translation ?? null,
		productUrl: session.productUrl,
		uploadedImages,
		filteredImages,
		finalBrandId: session.brandId ?? null,
		matchedCategoryId: session.categoryId ?? null,
		calculatedPriceMnt: session.calculatedPriceMnt ?? null,
		extractionStatus,
		errors,
	});

	await deleteSession(sessionId);
	logger.info("aiProduct.finalizeExtraction.done", {
		sessionId,
		status: result.extractionStatus,
	});

	return result;
}

export async function runFullExtraction(
	ctx: Context,
	query: string,
): Promise<ExtractedProductData> {
	const start = await startExtractionStage(ctx, query);
	await scrapeAndAnalyzeStage(ctx, start.sessionId);
	await translateStage(ctx, start.sessionId);
	return finalizeExtractionStage(ctx, start.sessionId);
}

export async function extractAndUploadProductImages(
	ctx: Context,
	query: string,
): Promise<{ images: { url: string }[]; sourceUrl: string }> {
	const firecrawl = getFirecrawl(ctx);
	const productUrl = isAmazonUrl(query)
		? query
		: await searchAmazonProduct(firecrawl, query);

	if (!productUrl) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Could not find product on Amazon. Try a direct URL.",
		});
	}

	const scrapeResult = await scrapeAmazonProduct(firecrawl, productUrl);
	if (!scrapeResult?.extracted.title) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to scrape product page.",
		});
	}

	const imageFilter = await filterProductImages(
		scrapeResult.extracted.title,
		scrapeResult.extracted.images,
	);

	if (imageFilter.images.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not extract usable product images from Amazon listing.",
		});
	}

	const uploadedImages = await uploadImagesToR2(imageFilter.images, ctx);

	return {
		images: uploadedImages,
		sourceUrl: productUrl,
	};
}

export type { AiProductSessionState };
