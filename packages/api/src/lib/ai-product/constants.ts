export const CACHE_TTL = {
	SCRAPE: 60 * 60 * 24 * 7,
	SEARCH: 60 * 60 * 24 * 3,
} as const;

export const PRICING_FORMULA = {
	intercept: 16_929,
	max: 500_000,
	min: 40_000,
	roundingStep: 5000,
	slope: 4587,
} as const;

// Empty string = "no logo yet". The storefront renders a brand-initial
// monogram fallback for brands without a logo URL. Never use an external
// placeholder URL here — those resolve to non-image content and render as
// broken images. See GitHub issue #11.
export const DEFAULT_BRAND_LOGO_URL = "";

export const AI_PRODUCT_SESSION_TTL = 60 * 60;

export const CDN_BASE_URL = "https://cdn.darjs.dev";

export const PRODUCT_IMAGE_UPLOAD_PREFIX = "products/catalog";
