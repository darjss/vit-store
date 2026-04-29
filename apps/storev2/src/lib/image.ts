type ProductImageVariant =
	| "thumb"
	| "card"
	| "feature"
	| "hero"
	| "sm"
	| "md";

const CDN_HOST = "https://cdn.darjs.dev";

const PRODUCT_IMAGE_VARIANTS: Record<
	ProductImageVariant,
	{ height: number; transform: string; width: number; sizes: string }
> = {
	thumb: {
		width: 120,
		height: 120,
		transform: "width=160,height=160,quality=70,fit=contain,format=auto",
		sizes: "120px",
	},
	card: {
		width: 360,
		height: 450,
		transform: "width=360,quality=75,fit=contain,format=auto",
		sizes:
			"(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw",
	},
	feature: {
		width: 480,
		height: 480,
		transform: "width=480,quality=78,fit=contain,format=auto",
		sizes: "(min-width: 1280px) 18vw, (min-width: 768px) 30vw, 50vw",
	},
	hero: {
		width: 980,
		height: 980,
		transform: "width=980,quality=82,fit=contain,format=auto",
		sizes: "(min-width: 1024px) 46vw, 100vw",
	},
	sm: {
		width: 360,
		height: 450,
		transform: "width=360,quality=75,fit=contain,format=auto",
		sizes:
			"(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw",
	},
	md: {
		width: 980,
		height: 980,
		transform: "width=980,quality=82,fit=contain,format=auto",
		sizes: "(min-width: 1024px) 46vw, 100vw",
	},
};

function toCdnImageSource(
	url: string | null | undefined,
	variant: ProductImageVariant,
) {
	if (!url) return "";
	if (url.includes("/cdn-cgi/image/")) return url;

	const opts = PRODUCT_IMAGE_VARIANTS[variant].transform;
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return `${CDN_HOST}/cdn-cgi/image/${opts}/${url}`;
	}

	const path = url.startsWith("/") ? url : `/${url}`;
	return `${CDN_HOST}/cdn-cgi/image/${opts}${path}`;
}

export function toProductImageUrl(
	url: string | null | undefined,
	variant: ProductImageVariant,
): string {
	return toCdnImageSource(url, variant);
}

export function getProductImageProps(
	url: string | null | undefined,
	variant: ProductImageVariant,
) {
	const config = PRODUCT_IMAGE_VARIANTS[variant];
	return {
		src: toCdnImageSource(url, variant),
		width: config.width,
		height: config.height,
		sizes: config.sizes,
	};
}
