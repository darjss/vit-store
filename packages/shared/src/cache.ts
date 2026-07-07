export type CachePolicy = {
	maxAge: number;
	staleWhileRevalidate: number;
};

export const CACHE_POLICY = {
	productsList: { maxAge: 21600, staleWhileRevalidate: 86400 },
	productDetail: { maxAge: 21600, staleWhileRevalidate: 86400 },
	homeFeed: { maxAge: 21600, staleWhileRevalidate: 86400 },
	categories: { maxAge: 86400, staleWhileRevalidate: 604800 },
	brands: { maxAge: 86400, staleWhileRevalidate: 604800 },
} as const satisfies Record<string, CachePolicy>;

export function cacheControlHeader(policy: CachePolicy): string {
	return `public, s-maxage=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`;
}

export type CatalogCacheAccumulator = {
	maxAge: number;
	staleWhileRevalidate: number;
	tags: Set<string>;
};

export const PRODUCTS_TAG = "products";
export const BRANDS_TAG = "brands";
export const CATEGORIES_TAG = "categories";

export function productTag(id: number | string): string {
	return `product:${id}`;
}

export function brandTag(id: number | string): string {
	return `brand:${id}`;
}

export function categoryTag(id: number | string): string {
	return `category:${id}`;
}
