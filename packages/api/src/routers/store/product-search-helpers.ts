import { productQueries } from "@vit/api/queries";
import { brandQueries } from "~/queries/brands";
import { categoryQueries } from "~/queries/categories";
import { projectStorefrontCard } from "~/queries/products/storefront-card";
import { searchProducts } from "~/lib/product-search/client";
import {
	normalizeSearchText,
	transliterateCyrillicToLatin,
} from "~/lib/product-search/text";

export interface SearchProductResult {
	id: number;
	slug: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	amount?: string | null;
	price: number;
	image: string;
	brand: string;
	stock: number;
	discount: number;
	categoryId?: number;
}

export interface AssistantProductResult {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
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

// Rich catalog row carrying the real stock state from whichever source served
// the query (MiniSearch index or the DB name fallback). Both call sites below
// project this down — the storefront drops stock, the assistant maps it — so
// the two-phase search control flow lives in exactly one place.
interface CatalogSearchRow {
	id: number;
	slug: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	amount?: string | null;
	price: number;
	image: string;
	brand: string;
	status: string;
	stock: number;
	discount: number;
	categoryId?: number;
}

export const performCatalogSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<CatalogSearchRow[]> => {
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

	if (searchResults.length > 0) {
		return searchResults
			.filter((result) => result.status === "active")
			.map((result) => ({
				id: result.id,
				slug: result.slug,
				name: result.name,
				nameMn: result.nameMn,
				potency: result.potency,
				amount: result.amount,
				price: result.price,
				image: result.image,
				brand: result.brand,
				status: result.status,
				stock: result.stock,
				discount: result.discount,
				categoryId: result.categoryId,
			}));
	}

	const q = productQueries.store;
	const fallbackResults = requireStock
		? await q.searchByNameWithStock(query, safeLimit)
		: await q.searchByName(query, safeLimit);

	return fallbackResults
		.map(projectStorefrontCard)
		.sort((a, b) => {
			const aIn = a.stock > 0;
			const bIn = b.stock > 0;
			if (aIn !== bIn) return aIn ? -1 : 1;
			return b.stock - a.stock;
		});
};

export const performProductSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<SearchProductResult[]> =>
	(await performCatalogSearch(query, limit, options)).map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		nameMn: row.nameMn,
		potency: row.potency,
		amount: row.amount,
		price: row.price,
		image: row.image,
		brand: row.brand,
		stock: row.stock,
		discount: row.discount,
		categoryId: row.categoryId,
	}));

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
): Promise<AssistantProductResult[]> =>
	(await performCatalogSearch(query, limit, filters)).map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		price: row.price,
		image: row.image,
		brand: row.brand,
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
	if (!normalizedQuery) return 0;

	const terms = normalizedQuery
		.split(" ")
		.filter((term) => term.length >= 2)
		.filter(
			(term) =>
				!options?.ignoreGenericTerms || !GENERIC_PRODUCT_SEARCH_TERMS.has(term),
		);
	if (terms.length === 0) return 0;

	return Math.max(
		...Array.from(
			new Set([
				normalizeSearchText(name),
				normalizeSearchText(transliterateCyrillicToLatin(name)),
			]),
		).map((normalizedName) => {
			if (!normalizedName) return 0;
			const nameTokens = normalizedName.split(" ");
			let score = 0;

			if (normalizedName === normalizedQuery) score += 1000;
			if (normalizedQuery.includes(normalizedName)) score += 900;
			if (normalizedName.startsWith(normalizedQuery)) score += 700;
			if (normalizedName.includes(normalizedQuery)) score += 500;

			for (const term of terms) {
				if (nameTokens.includes(term)) score += 120;
				else if (nameTokens.some((token) => token.startsWith(term)))
					score += 80;
				else if (normalizedName.includes(term)) score += 40;
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
				name: brand.name,
				slug: brand.slug,
				type: "brand" as const,
				productCount: brand.productCount,
				logoUrl: brand.logoUrl,
				score: scoreNavigationMatch(brand.name, query, {
					ignoreGenericTerms: true,
				}),
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
				slug: category.slug,
				type: "category" as const,
				productCount: category.productCount,
				score: scoreNavigationMatch(category.name, query),
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
