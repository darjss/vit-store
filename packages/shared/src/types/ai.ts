export type ExtractionStepId =
	| "searching"
	| "extracting"
	| "translating"
	| "uploading";

export type AiProductSessionStatus =
	| ExtractionStepId
	| "done"
	| "failed";

export interface FirecrawlExtractedProduct {
	title: string;
	brand: string | null;
	description: string | null;
	features: string[];
	images: string[];
	servingSize: string | null;
	servingsPerContainer: number | null;
	ingredients: string[];
	priceUsd: number | null;
}

export interface VisionAnalysisResult {
	ingredients: string[];
	servingSize: string | null;
	dailyIntake: number | null;
	supplementFacts: string | null;
}

export interface TranslationResult {
	name: string;
	name_mn: string;
	description: string;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	ingredients: string[];
	brandId: number | null;
	categoryId: number | null;
}

export interface ExtractedProductData {
	originalTitle: string;
	originalDescription: string | null;
	originalFeatures: string[];
	originalIngredients: string[];
	name: string;
	name_mn: string;
	description: string;
	brand: string | null;
	brandId: number | null;
	categoryId: number | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	tags?: string[];
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
	amazonPriceUsd: number | null;
	calculatedPriceMnt: number | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
	slug: string;
}

export interface AiProductSessionState {
	query: string;
	productUrl?: string;
	scraped?: FirecrawlExtractedProduct;
	filteredImages?: string[];
	vision?: VisionAnalysisResult;
	translation?: TranslationResult;
	brandId?: number | null;
	categoryId?: number | null;
	calculatedPriceMnt?: number | null;
	extractionStatus?: "success" | "partial" | "failed";
	errors: string[];
	status: AiProductSessionStatus;
}
