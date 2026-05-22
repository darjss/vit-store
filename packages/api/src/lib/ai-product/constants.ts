export const CACHE_TTL = {
	SCRAPE: 60 * 60 * 24 * 7,
	SEARCH: 60 * 60 * 24 * 3,
} as const;

export const PRICING_FORMULA = {
	slope: 4587,
	intercept: 16929,
	min: 40000,
	max: 500000,
	roundingStep: 5000,
} as const;

export const DEFAULT_BRAND_LOGO_URL = "https://www.placeholder.com/logo.png";

export const AI_PRODUCT_SESSION_TTL = 60 * 60;

export const CDN_BASE_URL = "https://cdn.darjs.dev";

export const PRODUCT_IMAGE_UPLOAD_PREFIX = "products/catalog";
