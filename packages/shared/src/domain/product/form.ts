import { findBrandId } from "../../utils";
import type { AIExtractedData, ProductFormValues } from "../../types";

type BrandOption = Parameters<typeof findBrandId>[1];

export type ProductFormProduct = {
	amount?: string;
	brandId?: string | number | null;
	categoryId?: string | number | null;
	dailyIntake?: number;
	description?: string;
	expirationDate?: string | null;
	id?: number;
	images?: Array<{ id?: number; url: string }>;
	ingredients?: Array<string>;
	name?: string;
	name_mn?: string | null;
	potency?: string;
	price?: number;
	seoDescription?: string | null;
	seoTitle?: string | null;
	status?: ProductFormValues["status"];
	stock?: number;
	tags?: Array<string>;
	weightGrams?: number;
};

export function getProductFormDefaults(
	product: ProductFormProduct | undefined,
	aiData: AIExtractedData | undefined,
	brands: BrandOption,
): ProductFormValues {
	return {
		amount: aiData?.amount || product?.amount || "",
		brandId: getBrandId(product, aiData, brands),
		categoryId: aiData?.categoryId ? String(aiData.categoryId) : String(product?.categoryId ?? ""),
		dailyIntake: aiData?.dailyIntake || product?.dailyIntake || 1,
		description: aiData?.description || product?.description || "",
		expirationDate: product?.expirationDate || "",
		images: aiData?.images || product?.images || [],
		ingredients: aiData?.ingredients || product?.ingredients || [],
		name: aiData?.name || product?.name || "",
		name_mn: aiData?.name_mn || product?.name_mn || "",
		potency: aiData?.potency || product?.potency || "",
		price: aiData?.price || product?.price || 0,
		seoDescription: aiData?.seoDescription || product?.seoDescription || "",
		seoTitle: aiData?.seoTitle || product?.seoTitle || "",
		status: product?.status || "draft",
		stock: product?.stock || 0,
		tags: aiData?.tags || product?.tags || [],
		weightGrams: aiData?.weightGrams || product?.weightGrams || 0,
	};
}

export function getAiProductFormValues(
	currentValues: ProductFormValues,
	aiData: AIExtractedData,
	brands: BrandOption,
): ProductFormValues {
	return {
		...currentValues,
		amount: aiData.amount,
		brandId: aiData.brandId
			? String(aiData.brandId)
			: String(findBrandId(aiData.brand, brands ?? [])),
		categoryId: aiData.categoryId ? String(aiData.categoryId) : "",
		dailyIntake: aiData.dailyIntake || 1,
		description: aiData.description,
		expirationDate: "",
		images: aiData.images,
		ingredients: aiData.ingredients || [],
		name: aiData.name,
		name_mn: aiData.name_mn || "",
		potency: aiData.potency,
		price: aiData.price || 0,
		seoDescription: aiData.seoDescription || "",
		seoTitle: aiData.seoTitle || "",
		tags: aiData.tags || [],
		weightGrams: aiData.weightGrams || 0,
	};
}

function getBrandId(
	product: ProductFormProduct | undefined,
	aiData: AIExtractedData | undefined,
	brands: BrandOption,
) {
	if (aiData?.brandId) {
		return String(aiData.brandId);
	}
	if (aiData?.brand) {
		return String(findBrandId(aiData.brand, brands ?? []));
	}
	return String(product?.brandId ?? "");
}
