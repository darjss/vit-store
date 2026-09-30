import { brandQueries } from "~/queries/brands";
import { categoryQueries } from "~/queries/categories";
import { searchProductPage, searchProducts } from "~/lib/product-search/client";
import type { ProductSearchFilters, ProductSearchSort } from "~/lib/product-search/types";
import { normalizeSearchText, transliterateCyrillicToLatin } from "~/lib/product-search/text";

export interface SearchProductResult {
	amount?: string | null;
	brand: string;
	categoryId?: number;
	discount: number;
	id: number;
	image: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	stock: number;
}

export interface AssistantProductResult {
	brand: string;
	id: number;
	image: string;
	name: string;
	price: number;
	slug: string;
	stockStatus: "in_stock" | "low_stock" | "out_of_stock";
}

export const mapStockStatus = (
	status: string,
	stock: number,
): AssistantProductResult["stockStatus"] => {
	if (status === "out_of_stock" || stock <= 0) {
		return "out_of_stock";
	}

	if (stock <= 5) {
		return "low_stock";
	}

	return "in_stock";
};

// Rich catalog row carrying the stock state returned by the search index.
// Storefront and assistant callers project this shared row for their own UI.
interface CatalogSearchRow {
	amount?: string | null;
	brand: string;
	categoryId?: number;
	discount: number;
	id: number;
	image: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	status: string;
	stock: number;
}

export const performCatalogSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<Array<CatalogSearchRow>> => {
	const requireStock = options?.requireStock ?? false;
	const safeLimit = Math.min(limit, 10);
	const filters =
		options?.brandId || options?.categoryId || requireStock
			? {
					brandId: options?.brandId,
					categoryId: options?.categoryId,
					requireStock,
				}
			: undefined;
	const searchResults = await searchProducts(query, safeLimit, filters);
	return searchResults
		.filter((result) => result.status === "active")
		.map((result) => ({
			amount: result.amount,
			brand: result.brand,
			categoryId: result.categoryId,
			discount: result.discount,
			id: result.id,
			image: result.image,
			name: result.name,
			nameMn: result.nameMn,
			potency: result.potency,
			price: result.price,
			slug: result.slug,
			status: result.status,
			stock: result.stock,
		}));
};

export const performProductSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<Array<SearchProductResult>> =>
	(await performCatalogSearch(query, limit, options)).map((row) => ({
		amount: row.amount,
		brand: row.brand,
		categoryId: row.categoryId,
		discount: row.discount,
		id: row.id,
		image: row.image,
		name: row.name,
		nameMn: row.nameMn,
		potency: row.potency,
		price: row.price,
		slug: row.slug,
		stock: row.stock,
	}));

export const performProductSearchPage = async (input: {
	filters?: ProductSearchFilters;
	page: number;
	pageSize: number;
	query: string;
	sort?: ProductSearchSort;
}) => {
	const result = await searchProductPage(input);
	return {
		items: result.items.map((row) => ({
			amount: row.amount,
			brand: row.brand,
			categoryId: row.categoryId,
			discount: row.discount,
			id: row.id,
			image: row.image,
			name: row.name,
			nameMn: row.nameMn,
			potency: row.potency,
			price: row.price,
			slug: row.slug,
			stock: row.stock,
		})),
		pagination: result.pagination,
	};
};

export const performProductSearchWithStock = async (
	query: string,
	limit: number,
	filters?: { brandId?: number; categoryId?: number },
) => performProductSearch(query, limit, { ...filters, requireStock: true });

// Assistant-facing search: same catalog search as the storefront, but keeps
// the real stock state (mapped via mapStockStatus, including the DB fallback)
// so the Messenger assistant renders accurate stock on product cards and
// surfaces out-of-stock items as alternatives instead of mislabeling them.
export const performAssistantProductSearch = async (
	query: string,
	limit: number,
	filters?: { brandId?: number; categoryId?: number },
): Promise<Array<AssistantProductResult>> =>
	(await performCatalogSearch(query, limit, filters)).map((row) => ({
		brand: row.brand,
		id: row.id,
		image: row.image,
		name: row.name,
		price: row.price,
		slug: row.slug,
		stockStatus: mapStockStatus(row.status, row.stock),
	}));

const GENERIC_PRODUCT_SEARCH_TERMS = new Set([
	"vitamin",
	"vitamins",
	"vit",
	"supplement",
	"supplements",
]);

const scoreNavigationMatch = (
	name: string,
	query: string,
	options?: { ignoreGenericTerms?: boolean },
) => {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) {
		return 0;
	}

	const terms = normalizedQuery
		.split(" ")
		.filter((term) => term.length >= 2)
		.filter((term) => !options?.ignoreGenericTerms || !GENERIC_PRODUCT_SEARCH_TERMS.has(term));
	if (terms.length === 0) {
		return 0;
	}

	return Math.max(
		...Array.from(
			new Set([normalizeSearchText(name), normalizeSearchText(transliterateCyrillicToLatin(name))]),
		).map((normalizedName) => {
			if (!normalizedName) {
				return 0;
			}
			const nameTokens = normalizedName.split(" ");
			let score = 0;

			if (normalizedName === normalizedQuery) {
				score += 1000;
			}
			if (normalizedQuery.includes(normalizedName)) {
				score += 900;
			}
			if (normalizedName.startsWith(normalizedQuery)) {
				score += 700;
			}
			if (normalizedName.includes(normalizedQuery)) {
				score += 500;
			}

			for (const term of terms) {
				if (nameTokens.includes(term)) {
					score += 120;
				} else if (nameTokens.some((token) => token.startsWith(term))) {
					score += 80;
				} else if (normalizedName.includes(term)) {
					score += 40;
				}
			}

			return score;
		}),
	);
};

export const searchNavigationResults = async (query: string, limit: number) => {
	const [brands, categories] = await Promise.all([
		brandQueries.store.getAllBrands(),
		categoryQueries.store.getAllCategories(),
	]);
	const safeLimit = Math.min(Math.max(limit, 1), 8);

	return {
		brands: brands
			.map((brand) => ({
				id: brand.id,
				logoUrl: brand.logoUrl,
				name: brand.name,
				productCount: brand.productCount,
				score: scoreNavigationMatch(brand.name, query, {
					ignoreGenericTerms: true,
				}),
				slug: brand.slug,
				type: "brand" as const,
			}))
			.filter((brand) => brand.score > 0 && brand.productCount > 0)
			.sort(
				(a, b) =>
					b.score - a.score ||
					(b.productCount ?? 0) - (a.productCount ?? 0) ||
					a.name.localeCompare(b.name),
			)
			.slice(0, safeLimit)
			.map(({ score: _score, ...brand }) => brand),
		categories: categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				productCount: category.productCount,
				score: scoreNavigationMatch(category.name, query),
				slug: category.slug,
				type: "category" as const,
			}))
			.filter((category) => category.score > 0 && category.productCount > 0)
			.sort(
				(a, b) =>
					b.score - a.score ||
					(b.productCount ?? 0) - (a.productCount ?? 0) ||
					a.name.localeCompare(b.name),
			)
			.slice(0, safeLimit)
			.map(({ score: _score, ...category }) => category),
	};
};
