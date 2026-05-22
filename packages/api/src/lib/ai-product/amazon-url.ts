import { CACHE_TTL } from "~/lib/ai-product/constants";

export function scrapeCacheKey(url: string): string {
	return `ai-product:scrape:${Buffer.from(url).toString("base64url")}`;
}

export function searchCacheKey(query: string): string {
	return `ai-product:search:${Buffer.from(query.toLowerCase().trim()).toString("base64url")}`;
}

export function aiProductSessionKey(sessionId: string): string {
	return `ai-product:session:${sessionId}`;
}

export function isAmazonUrl(input: string): boolean {
	try {
		const url = new URL(input);
		return (
			url.hostname.includes("amazon.com") ||
			url.hostname.includes("amazon.co") ||
			url.hostname.includes("amzn.to") ||
			url.hostname.includes("amzn.com")
		);
	} catch {
		return false;
	}
}

export function toHighResUrl(imageId: string): string {
	const cleanId = imageId.replace(/\.[^.]+$/, "");
	return `https://m.media-amazon.com/images/I/${cleanId}._AC_SL1500_.jpg`;
}

export { CACHE_TTL };
