import type { ProductSortDirection } from "@vit/shared/domain/product";

export type ProductSearchRebuildReason =
	| "manual"
	| "product_created"
	| "product_updated"
	| "product_stock_updated"
	| "product_deleted"
	| "brand_updated"
	| "category_updated";

export interface ProductSearchFilters {
	brandId?: number;
	categoryId?: number;
	maxPrice?: number;
	minPrice?: number;
	requireStock?: boolean;
}

export const PRODUCT_SEARCH_SORT_FIELDS = ["price", "createdAt"] as const;
export type ProductSearchSortField = (typeof PRODUCT_SEARCH_SORT_FIELDS)[number];

export interface ProductSearchSort {
	direction: ProductSortDirection;
	field: ProductSearchSortField;
}

export interface ProductSearchInput {
	filters?: ProductSearchFilters;
	page?: number;
	pageSize?: number;
	query: string;
	sort?: ProductSearchSort;
}

export interface ProductSearchPage {
	items: Array<SearchProductResult>;
	pagination: {
		hasNextPage: boolean;
		hasPreviousPage: boolean;
		page: number;
		pageSize: number;
		totalCount: number;
		totalPages: number;
	};
}

export interface SearchProductResult {
	amount: string;
	brand: string;
	brandId?: number;
	category: string;
	categoryId?: number;
	createdAt: string;
	dailyIntake: number;
	discount: number;
	hasImage: boolean;
	id: number;
	image: string;
	ingredientPreview: Array<string>;
	inStock: boolean;
	isFeatured: boolean;
	name: string;
	nameMn?: string;
	potency: string;
	price: number;
	slug: string;
	status: string;
	stock: number;
}

export interface SearchNavigationResult {
	id: number;
	logoUrl?: string | null;
	name: string;
	productCount?: number;
	type: "brand" | "category";
}

export interface StorefrontSearchResult {
	brands: Array<SearchNavigationResult>;
	categories: Array<SearchNavigationResult>;
	products: Array<SearchProductResult>;
}

export interface ProductSearchDocument {
	aliases: string;
	amount: string;
	brand: string;
	brandId: number;
	category: string;
	categoryId: number;
	createdAt: string;
	createdAtEpoch: number;
	dailyIntake: number;
	description: string;
	discount: number;
	dosage: string;
	hasImage: boolean;
	id: number;
	image: string;
	ingredientPreviewJson: string;
	ingredients: string;
	inStock: boolean;
	intentTerms: string;
	isFeatured: boolean;
	name: string;
	nameMn: string;
	nameMnWithBrand: string;
	nameWithBrand: string;
	potency: string;
	price: number;
	primaryName: string;
	primaryNameMn: string;
	rankingScore: number;
	slug: string;
	status: string;
	stock: number;
	tags: string;
}

export interface ProductSearchAnalyticsSignal {
	addToCarts: number;
	productId: number;
	searchClickSessions: number;
	uniqueViewers: number;
}

export interface ProductSearchRanking {
	rankingScore: number;
}

export interface ProductSearchSourceDocument {
	amount?: string | null;
	brand: string;
	brandId?: number;
	category: string;
	categoryId?: number;
	createdAt: Date | string;
	dailyIntake?: number | null;
	description?: string | null;
	discount?: number | null;
	id: number;
	image?: string | null;
	ingredients?: Array<string> | string | null;
	isFeatured?: boolean;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	status: string;
	stock: number;
	tags?: Array<string> | string | null;
}

export interface ProductSearchStatus {
	activeGeneration: string | null;
	generatedAt: string | null;
	initialized: boolean;
	lastError: string | null;
	lastRebuildFinishedAt: string | null;
	lastRebuildReason: ProductSearchRebuildReason | null;
	lastRebuildStartedAt: string | null;
	productCount: number;
}
