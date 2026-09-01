import { PRODUCT_PER_PAGE, status } from "@vit/shared/constants";
import * as v from "valibot";
import type { ProductType, RouterOutputs } from "@/lib/types";

export type ProductListStatus = (typeof status)[number];

export type ProductsSearch = {
	brandId?: number;
	categoryId?: number;
	page: number;
	pageSize: number;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
	status?: ProductListStatus;
};

type InstantSearchProduct = RouterOutputs["product"]["searchProductsInstant"][number];

const instantSearchStatusSchema = v.picklist(status);

export function instantSearchToProductCard(product: InstantSearchProduct): ProductType {
	const parsedStatus = v.parse(instantSearchStatusSchema, product.status);
	return {
		amount: "",
		brandId: 0,
		categoryId: 0,
		createdAt: new Date(0),
		dailyIntake: 0,
		deletedAt: null,
		description: "",
		discount: 0,
		expirationDate: null,
		id: product.id,
		images: product.images.map((image, index) => ({
			id: index,
			isPrimary: index === 0,
			url: image.url,
		})),
		ingredients: [],
		isFeatured: false,
		name: product.name,
		name_mn: null,
		oldSlugs: [],
		potency: "",
		price: product.price,
		seoDescription: null,
		seoTitle: null,
		slug: product.slug,
		status: parsedStatus,
		stock: product.stock,
		tags: [],
		updatedAt: null,
		weightGrams: 0,
	};
}

export const DEFAULT_PRODUCTS_PAGE_SIZE = PRODUCT_PER_PAGE;
export const INSTANT_SEARCH_STALE_TIME_MS = 5 * 60 * 1000;
export const INSTANT_SEARCH_GC_TIME_MS = 30 * 60 * 1000;
export const INFINITE_PRODUCTS_PAGE_SIZE = 9;

export function getScrollParent(element: HTMLElement | null): HTMLElement | null {
	if (!element) {
		return null;
	}
	let parent: HTMLElement | null = element.parentElement;
	while (parent) {
		const { overflowY } = getComputedStyle(parent);
		if (["auto", "scroll", "overlay"].includes(overflowY)) {
			return parent;
		}
		parent = parent.parentElement;
	}
	return null;
}
