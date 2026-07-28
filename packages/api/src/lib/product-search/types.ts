import type { ProductSortDirection } from "@vit/shared/domain/product";
import * as v from "valibot";

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
	requireStock?: boolean;
	minPrice?: number;
	maxPrice?: number;
}

export const PRODUCT_SEARCH_SORT_FIELDS = ["price", "createdAt"] as const;
export type ProductSearchSortField =
	(typeof PRODUCT_SEARCH_SORT_FIELDS)[number];

export interface ProductSearchSort {
	field: ProductSearchSortField;
	direction: ProductSortDirection;
}

export interface ProductSearchInput {
	query: string;
	page?: number;
	pageSize?: number;
	filters?: ProductSearchFilters;
	sort?: ProductSearchSort;
}

export interface ProductSearchPage {
	items: SearchProductResult[];
	pagination: {
		page: number;
		pageSize: number;
		totalCount: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}

export interface SearchProductResult {
	id: number;
	name: string;
	nameMn?: string;
	slug: string;
	price: number;
	createdAt: string;
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
	createdAt: string;
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
	createdAt: Date | string;
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
	version: 2;
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
	search(input: ProductSearchInput): Promise<ProductSearchPage>;
	rebuild(reason: ProductSearchRebuildReason): Promise<ProductSearchStatus>;
	getStatus(): Promise<ProductSearchStatus>;
	clear(): Promise<void>;
}

export const productSearchRebuildReasonSchema = v.picklist([
	"manual",
	"product_created",
	"product_updated",
	"product_stock_updated",
	"product_deleted",
	"brand_updated",
	"category_updated",
	"cold_missing_snapshot",
]);

export const productSearchFiltersSchema = v.strictObject({
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	requireStock: v.optional(v.boolean()),
	minPrice: v.optional(v.pipe(v.number(), v.minValue(0))),
	maxPrice: v.optional(v.pipe(v.number(), v.minValue(0))),
});

export const productSearchSortSchema = v.strictObject({
	field: v.picklist(PRODUCT_SEARCH_SORT_FIELDS),
	direction: v.picklist(["asc", "desc"]),
});

export const productSearchInputSchema = v.strictObject({
	query: v.string(),
	page: v.optional(v.pipe(v.number(), v.integer())),
	pageSize: v.optional(v.pipe(v.number(), v.integer())),
	filters: v.optional(productSearchFiltersSchema),
	sort: v.optional(productSearchSortSchema),
}) satisfies v.GenericSchema<unknown, ProductSearchInput>;

export const searchProductResultSchema = v.strictObject({
	id: v.number(),
	name: v.string(),
	nameMn: v.optional(v.string()),
	slug: v.string(),
	price: v.number(),
	createdAt: v.string(),
	discount: v.number(),
	brand: v.string(),
	category: v.string(),
	status: v.string(),
	stock: v.number(),
	inStock: v.boolean(),
	amount: v.string(),
	potency: v.string(),
	dailyIntake: v.number(),
	brandId: v.optional(v.number()),
	categoryId: v.optional(v.number()),
	isFeatured: v.boolean(),
	image: v.string(),
	hasImage: v.boolean(),
	ingredientPreview: v.array(v.string()),
}) satisfies v.GenericSchema<unknown, SearchProductResult>;

export const productSearchPageSchema = v.strictObject({
	items: v.array(searchProductResultSchema),
	pagination: v.strictObject({
		page: v.pipe(v.number(), v.integer(), v.minValue(1)),
		pageSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
		totalCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
		totalPages: v.pipe(v.number(), v.integer(), v.minValue(0)),
		hasNextPage: v.boolean(),
		hasPreviousPage: v.boolean(),
	}),
}) satisfies v.GenericSchema<unknown, ProductSearchPage>;

export const productSearchDocumentSchema = v.strictObject({
	id: v.number(),
	name: v.string(),
	nameMn: v.string(),
	nameWithBrand: v.string(),
	nameMnWithBrand: v.string(),
	description: v.string(),
	slug: v.string(),
	price: v.number(),
	createdAt: v.string(),
	discount: v.number(),
	brand: v.string(),
	category: v.string(),
	status: v.string(),
	stock: v.number(),
	inStock: v.boolean(),
	amount: v.string(),
	potency: v.string(),
	dailyIntake: v.number(),
	brandId: v.optional(v.number()),
	categoryId: v.optional(v.number()),
	isFeatured: v.boolean(),
	image: v.string(),
	hasImage: v.boolean(),
	ingredientPreview: v.array(v.string()),
	ingredients: v.string(),
	tags: v.string(),
	aliases: v.string(),
	normalized: v.string(),
}) satisfies v.GenericSchema<unknown, ProductSearchDocument>;

export const productSearchSnapshotSchema = v.pipe(
	v.strictObject({
		version: v.literal(2),
		generatedAt: v.string(),
		productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
		documents: v.array(productSearchDocumentSchema),
		indexJson: v.string(),
	}),
	v.check(
		(snapshot) => snapshot.productCount === snapshot.documents.length,
		"Snapshot product count does not match its documents.",
	),
) satisfies v.GenericSchema<unknown, ProductSearchSnapshot>;

export const productSearchFailureSchema = v.variant("_tag", [
	v.strictObject({
		_tag: v.literal("InvalidSearchRequest"),
		code: v.literal("invalid_request"),
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("RetryableSearchFailure"),
		code: v.picklist(["timeout", "overloaded", "provider_unavailable"]),
		retryable: v.literal(true),
	}),
	v.strictObject({
		_tag: v.literal("PermanentSearchFailure"),
		code: v.picklist(["provider_rejected", "malformed_response"]),
		retryable: v.literal(false),
	}),
]);

export type ProductSearchFailure = v.InferOutput<
	typeof productSearchFailureSchema
>;

export const productSearchStatusSchema = v.strictObject({
	initialized: v.boolean(),
	memoryReady: v.boolean(),
	productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
	generatedAt: v.nullable(v.string()),
	lastRebuildStartedAt: v.nullable(v.string()),
	lastRebuildFinishedAt: v.nullable(v.string()),
	lastRebuildReason: v.nullable(productSearchRebuildReasonSchema),
	lastError: v.nullable(v.string()),
}) satisfies v.GenericSchema<unknown, ProductSearchStatus>;
