type ProductImageSize = "sm" | "md";

const CDN_HOST = "https://cdn.darjs.dev";

const SIZE_OPTS: Record<ProductImageSize, string> = {
	sm: "width=360,quality=75,fit=contain,format=auto",
	md: "width=980,quality=82,fit=contain,format=auto",
};

export function toProductImageUrl(
	url: string | null | undefined,
	size: ProductImageSize,
): string {
	if (!url) return "";
	if (url.includes("/cdn-cgi/image/")) return url;

	const opts = SIZE_OPTS[size];
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return `${CDN_HOST}/cdn-cgi/image/${opts}/${url}`;
	}

	const path = url.startsWith("/") ? url : `/${url}`;
	return `${CDN_HOST}/cdn-cgi/image/${opts}${path}`;
}
