import { PRODUCT_PER_PAGE, status } from "@vit/shared/constants";

export type ProductListStatus = (typeof status)[number];

export type ProductsSearch = {
	page: number;
	pageSize: number;
	brandId?: number;
	categoryId?: number;
	status?: ProductListStatus;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
};

export const DEFAULT_PRODUCTS_PAGE_SIZE = PRODUCT_PER_PAGE;
export const INSTANT_SEARCH_STALE_TIME_MS = 5 * 60 * 1000;
export const INSTANT_SEARCH_GC_TIME_MS = 30 * 60 * 1000;
export const INFINITE_PRODUCTS_PAGE_SIZE = 9;

export function getScrollParent(element: HTMLElement | null): HTMLElement | null {
	if (!element) return null;
	let parent: HTMLElement | null = element.parentElement;
	while (parent) {
		const { overflowY } = getComputedStyle(parent);
		if (["auto", "scroll", "overlay"].includes(overflowY)) return parent;
		parent = parent.parentElement;
	}
	return null;
}
