export const PRODUCT_SEARCH_OBJECT_NAME = "product-search-global";

export type ProductSearchRebuildReason =
	| "manual"
	| "product_created"
	| "product_updated"
	| "product_stock_updated"
	| "product_deleted"
	| "brand_updated"
	| "category_updated"
	| "cold_missing_snapshot";

export interface ProductSearchFilters {
	brandId?: number;
	categoryId?: number;
}

export interface ProductSearchInput {
	query: string;
	limit?: number;
	filters?: ProductSearchFilters;
}

export interface SearchProductResult {
	id: number;
	name: string;
	nameMn?: string;
	slug: string;
	price: number;
	discount: number;
	brand: string;
	category: string;
	status: string;
	stock: number;
	inStock: boolean;
	amount: string;
	potency: string;
	dailyIntake: number;
	brandId?: number;
	categoryId?: number;
	isFeatured: boolean;
	image: string;
	hasImage: boolean;
	ingredientPreview: string[];
}

export interface SearchNavigationResult {
	id: number;
	name: string;
	type: "brand" | "category";
	productCount?: number;
	logoUrl?: string | null;
}

export interface StorefrontSearchResult {
	products: SearchProductResult[];
	brands: SearchNavigationResult[];
	categories: SearchNavigationResult[];
}

export interface ProductSearchDocument {
	id: number;
	name: string;
	nameMn: string;
	nameWithBrand: string;
	nameMnWithBrand: string;
	description: string;
	slug: string;
	price: number;
	discount: number;
	brand: string;
	category: string;
	status: string;
	stock: number;
	inStock: boolean;
	amount: string;
	potency: string;
	dailyIntake: number;
	brandId?: number;
	categoryId?: number;
	isFeatured: boolean;
	image: string;
	hasImage: boolean;
	ingredientPreview: string[];
	ingredients: string;
	tags: string;
	aliases: string;
	normalized: string;
}

export interface ProductSearchSourceDocument {
	id: number;
	name: string;
	nameMn?: string | null;
	description?: string | null;
	slug: string;
	price: number;
	discount?: number | null;
	brand: string;
	category: string;
	status: string;
	stock: number;
	amount?: string | null;
	potency?: string | null;
	dailyIntake?: number | null;
	brandId?: number;
	categoryId?: number;
	isFeatured?: boolean;
	ingredients?: string[] | string | null;
	tags?: string[] | string | null;
	image?: string | null;
}

export interface ProductSearchSnapshot {
	version: 1;
	generatedAt: string;
	productCount: number;
	documents: ProductSearchDocument[];
	indexJson: string;
}

export interface ProductSearchStatus {
	initialized: boolean;
	memoryReady: boolean;
	productCount: number;
	generatedAt: string | null;
	lastRebuildStartedAt: string | null;
	lastRebuildFinishedAt: string | null;
	lastRebuildReason: ProductSearchRebuildReason | null;
	lastError: string | null;
}

export interface ProductSearchService {
	search(input: ProductSearchInput): Promise<SearchProductResult[]>;
	rebuild(reason: ProductSearchRebuildReason): Promise<ProductSearchStatus>;
	getStatus(): Promise<ProductSearchStatus>;
	clear(): Promise<void>;
}
