export type CachePolicy = {
	maxAge: number;
	staleWhileRevalidate: number;
	/** Use max-age so Cloudflare can serve stale while revalidating. */
	useMaxAge?: boolean;
};

export const CACHE_POLICY = {
	brands: { maxAge: 86_400, staleWhileRevalidate: 604_800 },
	categories: { maxAge: 86_400, staleWhileRevalidate: 604_800 },
	homeFeed: { maxAge: 21_600, staleWhileRevalidate: 86_400 },
	inventory: {
		maxAge: 10,
		staleWhileRevalidate: 5,
		useMaxAge: true,
	},
	productDetail: { maxAge: 21_600, staleWhileRevalidate: 86_400 },
	productsList: { maxAge: 21_600, staleWhileRevalidate: 86_400 },
} as const satisfies Record<string, CachePolicy>;

export function cacheControlHeader(policy: CachePolicy): string {
	const freshness = policy.useMaxAge ? "max-age" : "s-maxage";
	return `public, ${freshness}=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`;
}

export type CatalogCacheAccumulator = {
	maxAge: number;
	staleWhileRevalidate: number;
	tags: Set<string>;
	useMaxAge: boolean;
};

export const PRODUCTS_TAG = "products";
export const BRANDS_TAG = "brands";
export const CATEGORIES_TAG = "categories";
export const SITE_SHELL_TAG = "site-shell";
export const HOME_TAG = "home";
export const CATALOG_TAG = "catalog";

export function productTag(id: number | string): string {
	return `product-${id}`;
}

export function brandTag(id: number | string): string {
	return `brand-${id}`;
}

export function categoryTag(id: number | string): string {
	return `category-${id}`;
}

export function inventoryTag(id: number | string): string {
	return `inventory-${id}`;
}
