import type * as v from "valibot";

import type { AddProductInput } from "../mutations";
import type { ProductStatus } from "../types";

/** What the form needs from a product — satisfied by list, detail, or search data. */
export interface ProductFormProduct {
	id?: number;
	name?: string;
	description?: string;
	dailyIntake?: number;
	brandId?: number | string | null;
	categoryId?: number | string | null;
	amount?: string;
	potency?: string;
	status?: ProductStatus;
	stock?: number;
	price?: number;
	images?: Array<{ url: string; id?: number }>;
	name_mn?: string | null;
	ingredients?: string[];
	tags?: string[];
	seoTitle?: string | null;
	seoDescription?: string | null;
	weightGrams?: number;
	expirationDate?: string | null;
}

export interface ProductFormDraft {
	name: string;
	name_mn: string;
	description: string;
	dailyIntake: number;
	brandId: string;
	categoryId: string;
	amount: string;
	potency: string;
	status: ProductStatus;
	stock: number;
	price: number;
	expirationDate: string;
	weightGrams: number;
	ingredients: string[];
	tags: string[];
	seoTitle: string;
	seoDescription: string;
	images: Array<{ url: string; id?: number }>;
}

const pick = <T>(value: T | null | undefined, fallback: T): T =>
	value === null || value === undefined ? fallback : value;
const pickList = <T>(value: T[] | undefined): T[] => (value ? [...value] : []);
const pickImages = (value: Array<{ url: string; id?: number }> | undefined) =>
	value ? value.map((image) => ({ ...image })) : [];

const brandIdValue = (product?: ProductFormProduct) =>
	product?.brandId != null ? String(product.brandId) : "";
const categoryIdValue = (product?: ProductFormProduct) =>
	product?.categoryId != null ? String(product.categoryId) : "";

export function productFormDefaults(
	product?: ProductFormProduct,
): ProductFormDraft {
	return {
		name: pick(product?.name, ""),
		name_mn: pick(product?.name_mn, ""),
		description: pick(product?.description, ""),
		dailyIntake: pick(product?.dailyIntake, 1),
		brandId: brandIdValue(product),
		categoryId: categoryIdValue(product),
		amount: pick(product?.amount, ""),
		potency: pick(product?.potency, ""),
		status: pick(product?.status, "draft"),
		stock: pick(product?.stock, 0),
		price: pick(product?.price, 0),
		expirationDate: pick(product?.expirationDate, ""),
		weightGrams: pick(product?.weightGrams, 0),
		ingredients: pickList(product?.ingredients),
		tags: pickList(product?.tags),
		seoTitle: pick(product?.seoTitle, ""),
		seoDescription: pick(product?.seoDescription, ""),
		images: pickImages(product?.images),
	};
}

export function productFormIsDirty(
	draft: ProductFormDraft,
	baseline: ProductFormDraft,
): boolean {
	return JSON.stringify(draft) !== JSON.stringify(baseline);
}

/** Build the schema input from the draft (strings stay strings — the schema transforms brandId/categoryId). */
export function productFormToInput(draft: ProductFormDraft): AddProductInput {
	return {
		name: draft.name.trim(),
		description: draft.description.trim(),
		dailyIntake: draft.dailyIntake,
		brandId: draft.brandId,
		categoryId: draft.categoryId,
		amount: draft.amount.trim(),
		potency: draft.potency.trim(),
		status: draft.status,
		stock: draft.stock,
		price: draft.price,
		images: draft.images
			.filter((image) => image.url.trim() !== "")
			.map((image) => ({ url: image.url.trim(), id: image.id })),
		name_mn: draft.name_mn.trim() || undefined,
		ingredients: draft.ingredients,
		tags: draft.tags,
		seoTitle: draft.seoTitle.trim() || undefined,
		seoDescription: draft.seoDescription.trim() || undefined,
		weightGrams: draft.weightGrams,
		expirationDate: draft.expirationDate,
	};
}

export function productFormIssueErrors(
	issues: readonly v.BaseIssue<unknown>[],
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const issue of issues) {
		const first = issue.path?.[0];
		const field =
			first && "key" in first && typeof first.key === "string"
				? first.key
				: undefined;
		if (field && !out[field]) out[field] = issue.message;
	}
	return out;
}
