import * as v from "valibot";
import { publicErrorSchema } from "./errors";

export const productNotFoundSchema = publicErrorSchema("ProductNotFound", {});
export const productUnavailableSchema = publicErrorSchema(
	"ProductUnavailable",
	{},
);
export const insufficientStockSchema = publicErrorSchema("InsufficientStock", {
	requested: v.pipe(v.number(), v.integer(), v.minValue(1)),
	available: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export const searchUnavailableSchema = publicErrorSchema("SearchUnavailable", {
	retryable: v.boolean(),
});

export const productErrorSchema = v.variant("_tag", [
	productNotFoundSchema,
	productUnavailableSchema,
	insufficientStockSchema,
	searchUnavailableSchema,
]);

export const productLookupErrorSchema = v.variant("_tag", [
	productNotFoundSchema,
	productUnavailableSchema,
]);

export const catalogResourceNotFoundSchema = publicErrorSchema(
	"CatalogResourceNotFound",
	{ resource: v.picklist(["brand", "category"]) },
);

export const productImageSchema = v.strictObject({
	url: v.string(),
	isPrimary: v.boolean(),
});

export const productDetailSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	slug: v.string(),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
	status: v.string(),
	stock: v.pipe(v.number(), v.integer()),
	description: v.string(),
	discount: v.pipe(v.number(), v.integer()),
	amount: v.string(),
	potency: v.string(),
	dailyIntake: v.pipe(v.number(), v.integer()),
	categoryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	brandId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	ingredients: v.array(v.string()),
	weightGrams: v.pipe(v.number(), v.integer()),
	expirationDate: v.nullable(v.string()),
	seoTitle: v.nullable(v.string()),
	seoDescription: v.nullable(v.string()),
	images: v.array(productImageSchema),
	brand: v.strictObject({ name: v.string() }),
	category: v.strictObject({ name: v.string(), slug: v.string() }),
});

export const productSearchCardSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	slug: v.string(),
	name: v.string(),
	nameMn: v.optional(v.nullable(v.string())),
	potency: v.optional(v.nullable(v.string())),
	amount: v.optional(v.nullable(v.string())),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
	image: v.string(),
	brand: v.string(),
	stock: v.pipe(v.number(), v.integer()),
	discount: v.pipe(v.number(), v.integer()),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export const paginationSchema = v.strictObject({
	page: v.pipe(v.number(), v.integer(), v.minValue(1)),
	pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
	totalCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
	totalPages: v.pipe(v.number(), v.integer(), v.minValue(0)),
	hasNextPage: v.boolean(),
	hasPreviousPage: v.boolean(),
});

export const productSearchPageSchema = v.strictObject({
	items: v.array(productSearchCardSchema),
	pagination: paginationSchema,
});

export const searchNavigationBrandSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	slug: v.string(),
	type: v.literal("brand"),
	productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
	logoUrl: v.nullable(v.string()),
});

export const searchNavigationCategorySchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	slug: v.string(),
	type: v.literal("category"),
	productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const storefrontSearchSchema = v.strictObject({
	products: v.array(productSearchCardSchema),
	brands: v.array(searchNavigationBrandSchema),
	categories: v.array(searchNavigationCategorySchema),
});

export const categoryDetailSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	slug: v.string(),
	description: v.nullable(v.string()),
	bannerImage: v.nullable(v.string()),
	seoTitle: v.nullable(v.string()),
	seoDescription: v.nullable(v.string()),
});

export const brandDetailSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	slug: v.string(),
	logoUrl: v.string(),
	description: v.nullable(v.string()),
	bannerImage: v.nullable(v.string()),
	seoTitle: v.nullable(v.string()),
	seoDescription: v.nullable(v.string()),
	productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const productLookupResultSchemas = {
	value: productDetailSchema,
	error: productLookupErrorSchema,
};

export const productSearchPageResultSchemas = {
	value: productSearchPageSchema,
	error: searchUnavailableSchema,
};

export const storefrontSearchResultSchemas = {
	value: storefrontSearchSchema,
	error: searchUnavailableSchema,
};

export const categoryLookupResultSchemas = {
	value: categoryDetailSchema,
	error: catalogResourceNotFoundSchema,
};

export const brandLookupResultSchemas = {
	value: brandDetailSchema,
	error: catalogResourceNotFoundSchema,
};

export type ProductError = v.InferOutput<typeof productErrorSchema>;
export type ProductLookupError = v.InferOutput<typeof productLookupErrorSchema>;
export type SearchUnavailable = v.InferOutput<typeof searchUnavailableSchema>;
export type CatalogResourceNotFound = v.InferOutput<
	typeof catalogResourceNotFoundSchema
>;
export type ProductDetail = v.InferOutput<typeof productDetailSchema>;
export type ProductSearchPage = v.InferOutput<typeof productSearchPageSchema>;
export type StorefrontSearch = v.InferOutput<typeof storefrontSearchSchema>;
