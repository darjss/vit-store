import Firecrawl from "@mendable/firecrawl-js";
import type { AiProductSessionState, ExtractedProductData } from "@vit/shared";
import { Result } from "better-result";
import { brandQueries, categoryQueries } from "@vit/api/queries";
import {
	aiExtractionFailed,
	aiInvalidSource,
	aiNoUsableImages,
	aiProviderUnavailable,
} from "~/errors/factories/admin";
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

const getFirecrawl = (ctx: Context) => {
	const apiKey = ctx.c.env.FIRECRAWL_API_KEY;
	return apiKey
		? Result.ok(new Firecrawl({ apiKey }))
		: Result.err(aiProviderUnavailable(false));
};

const saveFailedSession = async (
	sessionId: string,
	session: AiProductSessionState,
	message: string,
) => {
	session.status = "failed";
	session.errors = [...session.errors, message];
	await writeSession(sessionId, session);
};

export async function startExtractionStage(ctx: Context, query: string) {
	const sessionId = createSessionId();
	const session = createInitialSession(query);
	const provider = getFirecrawl(ctx);
	if (provider.status === "error") {
		await saveFailedSession(sessionId, session, provider.error.message);
		return provider;
	}
	const productUrl = await resolveProductUrl(provider.value, query);
	if (!productUrl) {
		const error = aiInvalidSource();
		await saveFailedSession(sessionId, session, error.message);
		return Result.err(error);
	}

	session.productUrl = productUrl;
	session.status = "extracting";
	await writeSession(sessionId, session);
	return Result.ok({ sessionId, step: "searching" as const, productUrl });
}

export async function scrapeAndAnalyzeStage(ctx: Context, sessionId: string) {
	const session = await readSession(sessionId);
	if (!session?.productUrl) return Result.err(aiInvalidSource());

	const errors = [...session.errors];
	let extractionStatus = session.extractionStatus ?? "success";
	const provider = getFirecrawl(ctx);
	if (provider.status === "error") {
		await saveFailedSession(sessionId, session, provider.error.message);
		return provider;
	}
	const scrapeResult = await scrapeAmazonProduct(
		provider.value,
		session.productUrl,
	);
	if (!scrapeResult?.extracted.title) {
		const error = aiExtractionFailed(true);
		await saveFailedSession(sessionId, session, error.message);
		return Result.err(error);
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
	if (
		imageFilter.images.length === 0 &&
		scrapeResult.extracted.images.length > 0
	) {
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
	return Result.ok({ sessionId, step: "extracting" as const });
}

export async function translateStage(ctx: Context, sessionId: string) {
	const session = await readSession(sessionId);
	if (!session?.scraped || !session.vision) {
		return Result.err(aiInvalidSource());
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
		allBrands.map((brand) => ({ id: brand.id, name: brand.name })),
		allCategories.map((category) => ({
			id: category.id,
			name: category.name,
		})),
	);
	const validBrandIds = new Set(allBrands.map((brand) => brand.id));
	const validCategoryIds = new Set(
		allCategories.map((category) => category.id),
	);
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
			allBrands.map((brand) => ({ id: brand.id, name: brand.name })),
		));

	session.translation = structuredData ?? undefined;
	session.brandId = finalBrandId;
	session.categoryId = matchedCategoryId;
	session.errors = errors;
	session.extractionStatus = extractionStatus;
	session.status = "uploading";
	await writeSession(sessionId, session);
	return Result.ok({ sessionId, step: "translating" as const });
}

export async function finalizeExtractionStage(ctx: Context, sessionId: string) {
	const session = await readSession(sessionId);
	if (!session?.scraped || !session.vision || !session.productUrl) {
		return Result.err(aiInvalidSource());
	}

	const errors = [...session.errors];
	let extractionStatus = session.extractionStatus ?? "success";
	const filteredImages = session.filteredImages ?? [];
	let uploadedImages: { url: string }[] = [];
	if (filteredImages.length > 0) {
		uploadedImages = await uploadImagesToR2(filteredImages, ctx);
		if (
			noteImageUploadIssues(filteredImages, uploadedImages, errors) ===
			"partial"
		) {
			extractionStatus = "partial";
		}
	}

	const result: ExtractedProductData = assembleExtractedProductData({
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
	return Result.ok(result);
}

export async function runFullExtraction(ctx: Context, query: string) {
	const start = await startExtractionStage(ctx, query);
	if (start.status === "error") return start;
	const scraped = await scrapeAndAnalyzeStage(ctx, start.value.sessionId);
	if (scraped.status === "error") return scraped;
	const translated = await translateStage(ctx, start.value.sessionId);
	if (translated.status === "error") return translated;
	return finalizeExtractionStage(ctx, start.value.sessionId);
}

export async function extractAndUploadProductImages(
	ctx: Context,
	query: string,
) {
	const provider = getFirecrawl(ctx);
	if (provider.status === "error") return provider;
	const productUrl = isAmazonUrl(query)
		? query
		: await searchAmazonProduct(provider.value, query);
	if (!productUrl) return Result.err(aiInvalidSource());
	const scrapeResult = await scrapeAmazonProduct(provider.value, productUrl);
	if (!scrapeResult?.extracted.title) {
		return Result.err(aiExtractionFailed(true));
	}
	const imageFilter = await filterProductImages(
		scrapeResult.extracted.title,
		scrapeResult.extracted.images,
	);
	if (imageFilter.images.length === 0) {
		return Result.err(aiNoUsableImages());
	}
	const images = await uploadImagesToR2(imageFilter.images, ctx);
	return images.length > 0
		? Result.ok({ images, sourceUrl: productUrl })
		: Result.err(aiNoUsableImages());
}

export type { AiProductSessionState };
