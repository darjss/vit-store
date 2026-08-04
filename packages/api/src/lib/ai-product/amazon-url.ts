import { CACHE_TTL } from "~/lib/ai-product/constants";

const CACHE_VERSION = "v2";

export function scrapeCacheKey(url: string): string {
	return `ai-product:${CACHE_VERSION}:scrape:${Buffer.from(url).toString("base64url")}`;
}

export function searchCacheKey(query: string): string {
	return `ai-product:${CACHE_VERSION}:search:${Buffer.from(query.toLowerCase().trim()).toString("base64url")}`;
}

export function aiProductSessionKey(sessionId: string): string {
	return `ai-product:session:${sessionId}`;
}

function normalizeProductText(value: string): string {
	return value
		.toLowerCase()
		.replace(/(\d),(?=\d)/g, "$1")
		.replace(/\bd[-\s]?([23])\b/g, "d$1")
		.replace(/\bk[-\s]?2\b/g, "k2")
		.replace(/\bmk[-\s]?7\b/g, "mk7")
		.replace(/\bk[-\s]?7\b/g, "mk7")
		.replace(/\bsoft[-\s]?gels?\b/g, "softgels")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

type ProductIdentity = {
	doses: string[];
	counts: string[];
	variants: string[];
};

function productIdentity(value: string): ProductIdentity {
	const normalized = normalizeProductText(value);
	return {
		doses: uniqueStrings(
			Array.from(
				normalized.matchAll(/\b\d+(?:\.\d+)?\s*(?:iu|mcg|mg|g|ml|oz)\b/g),
				(match) => match[0].replace(/\s/g, ""),
			),
		),
		counts: uniqueStrings(
			Array.from(
				normalized.matchAll(
					/\b(\d+)\s+(?:(?:veggie|vegetable|vegan)\s+)?(softgels?|capsules?|tablets?|gummies?|servings?|count|ct)\b/g,
				),
				(match) => `${match[1]}${match[2]?.replace(/s$/, "")}`,
			),
		),
		variants: uniqueStrings(
			normalized
				.split(" ")
				.filter((token) => ["d2", "d3", "k2", "mk7"].includes(token)),
		),
	};
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function setsEqual(left: string[], right: string[]): boolean {
	return (
		left.length === right.length && left.every((value) => right.includes(value))
	);
}

function identityMatches(
	query: ProductIdentity,
	title: ProductIdentity,
): boolean {
	return (["doses", "counts", "variants"] as const).every((key) => {
		const expected = query[key];
		return expected.length === 0 || setsEqual(expected, title[key]);
	});
}

export function productTitleMatchesBrand(
	title: string,
	expectedBrand: string,
): boolean {
	const titleWords = new Set(normalizeProductText(title).split(" "));
	const brandWords = normalizeProductText(expectedBrand)
		.split(" ")
		.filter((word) => word.length >= 2);
	return (
		brandWords.length > 0 && brandWords.every((word) => titleWords.has(word))
	);
}

export function productTitleMatchesQuery(
	query: string,
	title: string,
): boolean {
	const normalizedQuery = normalizeProductText(query);
	const normalizedTitle = normalizeProductText(title);
	const titleWords = new Set(normalizedTitle.split(" "));
	const queryWords = normalizedQuery.split(" ");
	const genericFirstWords = new Set([
		"high",
		"maximum",
		"organic",
		"pure",
		"supplement",
		"supplements",
		"triple",
		"vitamin",
	]);
	const leadingWords = queryWords
		.filter((word) => word.length >= 3)
		.slice(0, 2);
	if (
		leadingWords[0] &&
		!genericFirstWords.has(leadingWords[0]) &&
		leadingWords.some((word) => !titleWords.has(word))
	) {
		return false;
	}

	if (!identityMatches(productIdentity(query), productIdentity(title))) {
		return false;
	}

	const ignored = new Set([
		"and",
		"for",
		"from",
		"supplement",
		"supplements",
		"the",
		"with",
	]);
	const meaningfulQueryWords = uniqueStrings(
		queryWords.filter((word) => word.length >= 3 && !ignored.has(word)),
	);
	if (meaningfulQueryWords.length === 0) return true;

	const matchingWords = meaningfulQueryWords.filter((word) =>
		titleWords.has(word),
	).length;
	return matchingWords / meaningfulQueryWords.length >= 0.6;
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
