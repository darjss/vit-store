export type ExtractionStepId = "searching" | "extracting" | "translating" | "uploading";

export type AiProductSessionStatus = ExtractionStepId | "done" | "failed";

export interface FirecrawlExtractedProduct {
	brand: string | null;
	description: string | null;
	features: Array<string>;
	images: Array<string>;
	ingredients: Array<string>;
	priceUsd: number | null;
	servingSize: string | null;
	servingsPerContainer: number | null;
	title: string;
}

export interface VisionAnalysisResult {
	dailyIntake: number | null;
	ingredients: Array<string>;
	servingSize: string | null;
	supplementFacts: string | null;
}

export interface TranslationResult {
	amount: string;
	brandId: number | null;
	categoryId: number | null;
	dailyIntake: number;
	description: string;
	ingredients: Array<string>;
	name: string;
	name_mn: string;
	potency: string;
	seoDescription: string;
	seoTitle: string;
	weightGrams: number;
}

export interface ExtractedProductData {
	amazonPriceUsd: number | null;
	amount: string;
	brand: string | null;
	brandId: number | null;
	calculatedPriceMnt: number | null;
	categoryId: number | null;
	dailyIntake: number;
	description: string;
	errors: Array<string>;
	extractionStatus: "success" | "partial" | "failed";
	images: Array<{ url: string }>;
	ingredients: Array<string>;
	name: string;
	name_mn: string;
	originalDescription: string | null;
	originalFeatures: Array<string>;
	originalIngredients: Array<string>;
	originalTitle: string;
	potency: string;
	seoDescription: string;
	seoTitle: string;
	slug: string;
	sourceUrl: string | null;
	tags?: Array<string>;
	weightGrams: number;
}

export interface AiProductSessionState {
	brandId?: number | null;
	calculatedPriceMnt?: number | null;
	categoryId?: number | null;
	errors: Array<string>;
	extractionStatus?: "success" | "partial" | "failed";
	filteredImages?: Array<string>;
	productUrl?: string;
	query: string;
	scraped?: FirecrawlExtractedProduct;
	status: AiProductSessionStatus;
	translation?: TranslationResult;
	vision?: VisionAnalysisResult;
}
