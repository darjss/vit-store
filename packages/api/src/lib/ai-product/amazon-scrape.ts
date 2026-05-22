import type Firecrawl from "@mendable/firecrawl-js";
import type { FirecrawlExtractedProduct } from "@vit/shared";
import { CACHE_TTL } from "~/lib/ai-product/constants";
import {
	extractAmazonPriceUsd,
	extractProductImageIds,
} from "~/lib/ai-product/amazon-html";
import { amazonProductSchema } from "~/lib/ai-product/schemas";
import {
	isAmazonUrl,
	scrapeCacheKey,
	searchCacheKey,
	toHighResUrl,
} from "~/lib/ai-product/amazon-url";
import { kv } from "~/lib/kv";
import { logger } from "~/lib/logger";

export { isAmazonUrl };

export async function searchAmazonProduct(
	firecrawl: Firecrawl,
	query: string,
): Promise<string | null> {
	const cacheKey = searchCacheKey(query);
	const startTime = Date.now();

	try {
		const cached = await kv().get(cacheKey, "json");
		if (cached) {
			logger.info("searchAmazonProduct.cacheHit", {
				query,
				elapsedMs: Date.now() - startTime,
			});
			return cached as string | null;
		}
	} catch (cacheError) {
		logger.warn("searchAmazonProduct.cacheReadFailed", {
			query,
			error: cacheError instanceof Error ? cacheError.message : "unknown",
		});
	}

	logger.info("searchAmazonProduct.start", { query });
	try {
		const searchResponse = await firecrawl.search(`site:amazon.com ${query}`, {
			limit: 5,
		});

		if (!searchResponse.web?.length) {
			await kv().put(cacheKey, JSON.stringify(null), {
				expirationTtl: CACHE_TTL.SEARCH,
			});
			return null;
		}

		let resultUrl: string | null = null;
		for (const result of searchResponse.web) {
			const url = "url" in result ? result.url : undefined;
			if (url && (url.includes("/dp/") || url.includes("/gp/product/"))) {
				resultUrl = url;
				break;
			}
		}

		if (!resultUrl) {
			const firstResult = searchResponse.web[0];
			const firstUrl = "url" in firstResult ? firstResult.url : undefined;
			if (firstUrl?.includes("amazon.com")) {
				resultUrl = firstUrl;
			}
		}

		await kv().put(cacheKey, JSON.stringify(resultUrl), {
			expirationTtl: CACHE_TTL.SEARCH,
		});

		return resultUrl;
	} catch (error) {
		logger.error("searchAmazonProduct.failed", error, { query });
		return null;
	}
}

export async function scrapeAmazonProduct(
	firecrawl: Firecrawl,
	url: string,
): Promise<{ extracted: FirecrawlExtractedProduct } | null> {
	const cacheKey = scrapeCacheKey(url);
	const startTime = Date.now();

	try {
		const cached = await kv().get(cacheKey, "json");
		if (cached) {
			return cached as { extracted: FirecrawlExtractedProduct } | null;
		}
	} catch (cacheError) {
		logger.warn("scrapeAmazonProduct.cacheReadFailed", {
			url,
			error: cacheError instanceof Error ? cacheError.message : "unknown",
		});
	}

	try {
		const scrapeResponse = await firecrawl.scrape(url, {
			formats: [{ type: "json", schema: amazonProductSchema }, "html"],
		});

		const jsonData = (scrapeResponse.json as Record<string, unknown>) || {};
		const html = scrapeResponse.html || "";
		const jsonPriceRaw = jsonData.priceUsd;
		const jsonPrice =
			typeof jsonPriceRaw === "number" &&
			Number.isFinite(jsonPriceRaw) &&
			jsonPriceRaw > 0 &&
			jsonPriceRaw <= 1000
				? jsonPriceRaw
				: null;
		const priceUsd = jsonPrice ?? extractAmazonPriceUsd(html);
		const imageIds = extractProductImageIds(html);
		const images = imageIds.map(toHighResUrl);

		const result = {
			extracted: {
				title: (jsonData.title as string) || "",
				brand: (jsonData.brand as string) || null,
				description: (jsonData.description as string) || null,
				features: (jsonData.features as string[]) || [],
				images,
				servingSize: (jsonData.servingSize as string) || null,
				servingsPerContainer: (jsonData.servingsPerContainer as number) || null,
				ingredients: (jsonData.ingredients as string[]) || [],
				priceUsd,
			},
		};

		await kv().put(cacheKey, JSON.stringify(result), {
			expirationTtl: CACHE_TTL.SCRAPE,
		});

		logger.info("scrapeAmazonProduct.done", {
			url,
			title: result.extracted.title,
			elapsedMs: Date.now() - startTime,
		});

		return result;
	} catch (error) {
		logger.error("scrapeAmazonProduct.failed", error, { url });
		return null;
	}
}

export async function resolveProductUrl(
	firecrawl: Firecrawl,
	query: string,
): Promise<string> {
	if (isAmazonUrl(query)) {
		return query;
	}

	const productUrl = await searchAmazonProduct(firecrawl, query);
	if (!productUrl) {
		throw new Error("Could not find product on Amazon. Try a direct URL.");
	}

	return productUrl;
}
