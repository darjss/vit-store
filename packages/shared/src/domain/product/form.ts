import { findBrandId } from "../../utils";
import type { AIExtractedData, ProductFormValues } from "../../types";

type BrandOption = Parameters<typeof findBrandId>[1];

export type ProductFormProduct = {
	name?: string;
	description?: string;
	dailyIntake?: number;
	brandId?: string | number | null;
	categoryId?: string | number | null;
	amount?: string;
	potency?: string;
	status?: ProductFormValues["status"];
	stock?: number;
	price?: number;
	images?: { url: string; id?: number }[];
	name_mn?: string | null;
	ingredients?: string[];
	tags?: string[];
	seoTitle?: string | null;
	seoDescription?: string | null;
	weightGrams?: number;
	expirationDate?: string | null;
};

export function getProductFormDefaults(
	product: ProductFormProduct | undefined,
	aiData: AIExtractedData | undefined,
	brands: BrandOption,
): ProductFormValues {
	return {
		name: aiData?.name || product?.name || "",
		description: aiData?.description || product?.description || "",
		dailyIntake: aiData?.dailyIntake || product?.dailyIntake || 1,
		brandId: getBrandId(product, aiData, brands),
		categoryId: aiData?.categoryId
			? String(aiData.categoryId)
			: String(product?.categoryId ?? ""),
		amount: aiData?.amount || product?.amount || "",
		potency: aiData?.potency || product?.potency || "",
		status: product?.status || "draft",
		stock: product?.stock || 0,
		price: aiData?.price || product?.price || 0,
		images: aiData?.images || product?.images || [],
		name_mn: aiData?.name_mn || product?.name_mn || "",
		ingredients: aiData?.ingredients || product?.ingredients || [],
		tags: aiData?.tags || product?.tags || [],
		seoTitle: aiData?.seoTitle || product?.seoTitle || "",
		seoDescription: aiData?.seoDescription || product?.seoDescription || "",
		weightGrams: aiData?.weightGrams || product?.weightGrams || 0,
		expirationDate: product?.expirationDate || "",
	};
}

export function getAiProductFormValues(
	currentValues: ProductFormValues,
	aiData: AIExtractedData,
	brands: BrandOption,
): ProductFormValues {
	return {
		...currentValues,
		name: aiData.name,
		description: aiData.description,
		dailyIntake: aiData.dailyIntake || 1,
		brandId: aiData.brandId
			? String(aiData.brandId)
			: String(findBrandId(aiData.brand, brands ?? [])),
		categoryId: aiData.categoryId ? String(aiData.categoryId) : "",
		amount: aiData.amount,
		potency: aiData.potency,
		price: aiData.price || 0,
		images: aiData.images,
		name_mn: aiData.name_mn || "",
		ingredients: aiData.ingredients || [],
		tags: aiData.tags || [],
		seoTitle: aiData.seoTitle || "",
		seoDescription: aiData.seoDescription || "",
		weightGrams: aiData.weightGrams || 0,
		expirationDate: "",
	};
}

function getBrandId(
	product: ProductFormProduct | undefined,
	aiData: AIExtractedData | undefined,
	brands: BrandOption,
) {
	if (aiData?.brandId) return String(aiData.brandId);
	if (aiData?.brand) return String(findBrandId(aiData.brand, brands ?? []));
	return String(product?.brandId ?? "");
}
