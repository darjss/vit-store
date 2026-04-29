export const productPresetFilterLabels = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
	discount: "Хямдралтай",
} as const;

export const productSortOptions = [
	{ label: "Шинэ", field: "createdAt", direction: "desc" },
	{ label: "Хямд", field: "price", direction: "asc" },
	{ label: "Үнэтэй", field: "price", direction: "desc" },
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
