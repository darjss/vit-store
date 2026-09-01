import type {
	ExtractedProductData,
	FirecrawlExtractedProduct,
	TranslationResult,
	VisionAnalysisResult,
} from "@vit/shared";
import { generateCleanSlug } from "~/lib/ai-product/brand-resolve";

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
		filteredImages,
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

	const name = structuredData?.name || extractedData.title;
	const amount = structuredData?.amount || "Unknown";
	const potency = structuredData?.potency || "Unknown";

	return {
		amazonPriceUsd: extractedData.priceUsd,
		amount,
		brand: extractedData.brand,
		brandId: finalBrandId,
		calculatedPriceMnt,
		categoryId: matchedCategoryId,
		dailyIntake: structuredData?.dailyIntake || visionData.dailyIntake || 1,
		description: structuredData?.description || extractedData.description || "Тайлбар байхгүй",
		errors,
		extractionStatus,
		images: uploadedImages,
		ingredients: structuredData?.ingredients || allOriginalIngredients,
		name,
		name_mn: structuredData?.name_mn || `${extractedData.title} (орчуулаагүй)`,
		originalDescription: extractedData.description,
		originalFeatures: extractedData.features,
		originalIngredients: allOriginalIngredients,
		originalTitle: extractedData.title,
		potency,
		seoDescription:
			structuredData?.seoDescription || (extractedData.description || "").slice(0, 155),
		seoTitle: structuredData?.seoTitle || extractedData.title.slice(0, 60),
		slug: generateCleanSlug(name, extractedData.brand, amount, potency),
		sourceUrl: productUrl,
		weightGrams: structuredData?.weightGrams || 200,
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
