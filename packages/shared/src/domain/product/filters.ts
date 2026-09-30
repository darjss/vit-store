export const productPresetFilterLabels = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
} as const;

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

export type ProductPresetFilter = keyof typeof productPresetFilterLabels;
