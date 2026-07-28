import type {
	CatalogResourceNotFound,
	ProductError,
	ProductLookupError,
	SearchUnavailable,
} from "@vit/shared";

export const productErrors = {
	notFound: () => ({ _tag: "ProductNotFound" }) satisfies ProductLookupError,
	unavailable: () =>
		({ _tag: "ProductUnavailable" }) satisfies ProductLookupError,
	insufficientStock: (requested: number, available: number) =>
		({
			_tag: "InsufficientStock",
			requested,
			available,
		}) satisfies ProductError,
	searchUnavailable: (retryable = true) =>
		({ _tag: "SearchUnavailable", retryable }) satisfies SearchUnavailable,
	catalogResourceNotFound: (resource: "brand" | "category") =>
		({
			_tag: "CatalogResourceNotFound",
			resource,
		}) satisfies CatalogResourceNotFound,
};
