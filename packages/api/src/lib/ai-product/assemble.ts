import type {
	ExtractedProductData,
	FirecrawlExtractedProduct,
	TranslationResult,
	VisionAnalysisResult,
} from "@vit/shared";
import { generateCleanSlug } from "~/lib/ai-product/brand-resolve";

function pickTruthy<T>(...values: Array<T | undefined | null>): T | undefined {
	for (const value of values) {
		if (value) {
			return value;
		}
	}
	return undefined;
}

function buildTranslatedIdentity(
	structuredData: TranslationResult | null,
	extractedData: FirecrawlExtractedProduct,
) {
	const name = pickTruthy(structuredData?.name, extractedData.title) ?? extractedData.title;
	const amount = pickTruthy(structuredData?.amount) ?? "Unknown";
	const potency = pickTruthy(structuredData?.potency) ?? "Unknown";
	return {
		amount,
		name,
		potency,
		slug: generateCleanSlug(name, extractedData.brand, amount, potency),
	};
}

function buildTranslatedCoreFields(
	structuredData: TranslationResult | null,
	extractedData: FirecrawlExtractedProduct,
	visionData: VisionAnalysisResult,
	allOriginalIngredients: Array<string>,
) {
	const identity = buildTranslatedIdentity(structuredData, extractedData);
	return {
		...identity,
		dailyIntake: pickTruthy(structuredData?.dailyIntake, visionData.dailyIntake) ?? 1,
		description:
			pickTruthy(structuredData?.description, extractedData.description) ?? "Тайлбар байхгүй",
		ingredients:
			pickTruthy(structuredData?.ingredients, allOriginalIngredients) ?? allOriginalIngredients,
		name_mn: pickTruthy(structuredData?.name_mn) ?? `${extractedData.title} (орчуулаагүй)`,
		weightGrams: pickTruthy(structuredData?.weightGrams) ?? 200,
	};
}

function buildTranslatedSeoFields(
	structuredData: TranslationResult | null,
	extractedData: FirecrawlExtractedProduct,
) {
	return {
		seoDescription:
			pickTruthy(structuredData?.seoDescription, extractedData.description?.slice(0, 155)) ??
			(extractedData.description || "").slice(0, 155),
		seoTitle:
			pickTruthy(structuredData?.seoTitle, extractedData.title.slice(0, 60)) ??
			extractedData.title.slice(0, 60),
	};
}

function buildTranslatedProductFields(
	structuredData: TranslationResult | null,
	extractedData: FirecrawlExtractedProduct,
	visionData: VisionAnalysisResult,
	allOriginalIngredients: Array<string>,
) {
	return {
		...buildTranslatedCoreFields(structuredData, extractedData, visionData, allOriginalIngredients),
		...buildTranslatedSeoFields(structuredData, extractedData),
	};
}

export function assembleExtractedProductData(params: {
	calculatedPriceMnt: number | null;
	errors: Array<string>;
	extractedData: FirecrawlExtractedProduct;
	extractionStatus: "success" | "partial" | "failed";
	filteredImages: Array<string>;
	finalBrandId: number | null;
	matchedCategoryId: number | null;
	productUrl: string;
	structuredData: TranslationResult | null;
	uploadedImages: Array<{ url: string }>;
	visionData: VisionAnalysisResult;
}): ExtractedProductData {
	const {
		calculatedPriceMnt,
		errors,
		extractedData,
		extractionStatus,
		finalBrandId,
		matchedCategoryId,
		productUrl,
		structuredData,
		uploadedImages,
		visionData,
	} = params;

	const allOriginalIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];
	const translated = buildTranslatedProductFields(
		structuredData,
		extractedData,
		visionData,
		allOriginalIngredients,
	);

	return {
		amazonPriceUsd: extractedData.priceUsd,
		...translated,
		brand: extractedData.brand,
		brandId: finalBrandId,
		calculatedPriceMnt,
		categoryId: matchedCategoryId,
		errors,
		extractionStatus,
		images: uploadedImages,
		originalDescription: extractedData.description,
		originalFeatures: extractedData.features,
		originalIngredients: allOriginalIngredients,
		originalTitle: extractedData.title,
		sourceUrl: productUrl,
	};
}

export function noteImageUploadIssues(
	filteredImages: Array<string>,
	uploadedImages: Array<{ url: string }>,
	errors: Array<string>,
): "success" | "partial" {
	let status: "success" | "partial" = "success";

	if (uploadedImages.length === 0 && filteredImages.length > 0) {
		errors.push("Image upload failed. No images were imported.");
		status = "partial";
	}

	if (
		filteredImages.length > 0 &&
		filteredImages.every((url, i) => url === uploadedImages[i]?.url)
	) {
		errors.push("Image upload failed. Using Amazon URLs.");
		status = "partial";
	}

	return status;
}
