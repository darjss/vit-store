import { SALE_CAMPAIGN } from "./sale";

/** Preset product lists, shared by the storefront URL `filter` param and the API `listType`. */
export const PRODUCT_PRESET_FILTERS = ["featured", "recent", "sale"] as const;

export type ProductPresetFilter = (typeof PRODUCT_PRESET_FILTERS)[number];

export const productPresetFilterLabels = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
	sale: SALE_CAMPAIGN.name,
} as const satisfies Record<ProductPresetFilter, string>;

export const productSortOptions = [
	{ direction: "desc", field: "createdAt", label: "Шинэ" },
	{ direction: "asc", field: "price", label: "Хямд" },
	{ direction: "desc", field: "price", label: "Үнэтэй" },
] as const;

export const trendingProductSearches = [
	"Vitamin D",
	"Omega 3",
	"Витамин C",
	"Магний",
	"Протеин",
	"Collagen",
] as const;
