import type {
	ExtractedProductData,
	FirecrawlExtractedProduct,
	TranslationResult,
	VisionAnalysisResult,
} from "@vit/shared";
import { generateCleanSlug } from "~/lib/ai-product/brand-resolve";

export function assembleExtractedProductData(params: {
	extractedData: FirecrawlExtractedProduct;
	visionData: VisionAnalysisResult;
	structuredData: TranslationResult | null;
	productUrl: string;
	uploadedImages: { url: string }[];
	filteredImages: string[];
	finalBrandId: number | null;
	matchedCategoryId: number | null;
	calculatedPriceMnt: number | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
}): ExtractedProductData {
	const {
		extractedData,
		visionData,
		structuredData,
		productUrl,
		uploadedImages,
		filteredImages,
		finalBrandId,
		matchedCategoryId,
		calculatedPriceMnt,
		extractionStatus,
		errors,
	} = params;

	const allOriginalIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	const name = structuredData?.name || extractedData.title;
	const amount = structuredData?.amount || "Unknown";
	const potency = structuredData?.potency || "Unknown";

	return {
		originalTitle: extractedData.title,
		originalDescription: extractedData.description,
		originalFeatures: extractedData.features,
		originalIngredients: allOriginalIngredients,
		name,
		name_mn: structuredData?.name_mn || `${extractedData.title} (орчуулаагүй)`,
		description:
			structuredData?.description ||
			extractedData.description ||
			"Тайлбар байхгүй",
		brand: extractedData.brand,
		brandId: finalBrandId,
		categoryId: matchedCategoryId,
		amount,
		potency,
		dailyIntake: structuredData?.dailyIntake || visionData.dailyIntake || 1,
		weightGrams: structuredData?.weightGrams || 200,
		seoTitle: structuredData?.seoTitle || extractedData.title.slice(0, 60),
		seoDescription:
			structuredData?.seoDescription ||
			(extractedData.description || "").slice(0, 155),
		ingredients: structuredData?.ingredients || allOriginalIngredients,
		images: uploadedImages,
		sourceUrl: productUrl,
		amazonPriceUsd: extractedData.priceUsd,
		calculatedPriceMnt,
		extractionStatus,
		errors,
		slug: generateCleanSlug(name, extractedData.brand, amount, potency),
	};
}

export function noteImageUploadIssues(
	filteredImages: string[],
	uploadedImages: { url: string }[],
	errors: string[],
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
