import { findBrandId } from "../../utils";
import type { AIExtractedData, ProductFormValues } from "../../types";

type BrandOption = Parameters<typeof findBrandId>[1];

function pickTruthy<T>(...values: Array<T | undefined | null>): T | undefined {
	for (const value of values) {
		if (value) {
			return value;
		}
	}
	return undefined;
}

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

function productPrimaryText(product: ProductFormProduct | undefined) {
	return {
		amount: product?.amount ?? "",
		description: product?.description ?? "",
		name: product?.name || "",
		name_mn: product?.name_mn || "",
	};
}

function productSecondaryText(product: ProductFormProduct | undefined) {
	return {
		expirationDate: product?.expirationDate || "",
		potency: product?.potency || "",
		seoDescription: product?.seoDescription || "",
		seoTitle: product?.seoTitle || "",
	};
}

function productTextFields(product: ProductFormProduct | undefined) {
	return {
		...productPrimaryText(product),
		...productSecondaryText(product),
	};
}

function productCollectionFields(product: ProductFormProduct | undefined) {
	return {
		images: product?.images || [],
		ingredients: product?.ingredients || [],
		tags: product?.tags || [],
	};
}

function productNumericFields(product: ProductFormProduct | undefined) {
	return {
		dailyIntake: product?.dailyIntake || 1,
		price: product?.price || 0,
		stock: product?.stock || 0,
		weightGrams: product?.weightGrams || 0,
	};
}

function productFormBase(product: ProductFormProduct | undefined): ProductFormValues {
	return {
		...productTextFields(product),
		...productCollectionFields(product),
		...productNumericFields(product),
		brandId: String(product?.brandId ?? ""),
		categoryId: String(product?.categoryId ?? ""),
		status: product?.status || "draft",
	};
}

function applyAiFormDefaults(
	base: ProductFormValues,
	aiData: AIExtractedData,
	brands: BrandOption,
): ProductFormValues {
	return {
		...base,
		amount: pickTruthy(aiData.amount, base.amount) ?? base.amount,
		brandId: getBrandId(undefined, aiData, brands),
		categoryId: aiData.categoryId ? String(aiData.categoryId) : base.categoryId,
		dailyIntake: pickTruthy(aiData.dailyIntake) ?? base.dailyIntake,
		description: pickTruthy(aiData.description, base.description) ?? base.description,
		images: pickTruthy(aiData.images, base.images) ?? base.images,
		ingredients: pickTruthy(aiData.ingredients, base.ingredients) ?? base.ingredients,
		name: pickTruthy(aiData.name, base.name) ?? base.name,
		name_mn: pickTruthy(aiData.name_mn, base.name_mn) ?? base.name_mn,
		potency: pickTruthy(aiData.potency, base.potency) ?? base.potency,
		price: pickTruthy(aiData.price) ?? base.price,
		seoDescription: pickTruthy(aiData.seoDescription, base.seoDescription) ?? base.seoDescription,
		seoTitle: pickTruthy(aiData.seoTitle, base.seoTitle) ?? base.seoTitle,
		tags: pickTruthy(aiData.tags, base.tags) ?? base.tags,
		weightGrams: pickTruthy(aiData.weightGrams) ?? base.weightGrams,
	};
}

export function getProductFormDefaults(
	product: ProductFormProduct | undefined,
	aiData: AIExtractedData | undefined,
	brands: BrandOption,
): ProductFormValues {
	const base = productFormBase(product);
	if (!aiData) {
		return {
			...base,
			brandId: getBrandId(product, aiData, brands),
		};
	}
	return applyAiFormDefaults(base, aiData, brands);
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
