import type Firecrawl from "@mendable/firecrawl-js";
import type { FirecrawlExtractedProduct } from "@vit/shared";
import * as v from "valibot";
import { extractAmazonPriceUsd, extractProductImageIds } from "~/lib/ai-product/amazon-html";
import {
	isAmazonUrl,
	productTitleMatchesQuery,
	scrapeCacheKey,
	searchCacheKey,
	toHighResUrl,
} from "~/lib/ai-product/amazon-url";
import { CACHE_TTL } from "~/lib/ai-product/constants";
import { amazonProductSchema } from "~/lib/ai-product/schemas";
import {
	amazonScrapeCacheSchema,
	amazonSearchCacheSchema,
	firecrawlAmazonJsonSchema,
	normalizeFirecrawlPriceUsd,
	toFirecrawlExtractedProduct,
} from "~/lib/ai-product/wire-schemas";
import { kv } from "~/lib/kv";
import { thrownErrorWireSchema } from "~/lib/logging";
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
		if (cached !== null) {
			logger.info("searchAmazonProduct.cacheHit", {
				elapsedMs: Date.now() - startTime,
				query,
			});
			return v.parse(amazonSearchCacheSchema, cached);
		}
	} catch (cacheError) {
		logger.warn("searchAmazonProduct.cacheReadFailed", {
			error: cacheError instanceof Error ? cacheError.message : "unknown",
			query,
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

		const productResults = searchResponse.web.flatMap((result) => {
			const url = "url" in result ? result.url : undefined;
			if (!url || (!url.includes("/dp/") && !url.includes("/gp/product/"))) {
				return [];
			}
			const title = "title" in result ? result.title : undefined;
			return [{ title, url }];
		});
		const matchingResult = productResults.find(
			(result) => result.title && productTitleMatchesQuery(query, result.title),
		);
		let resultUrl = matchingResult?.url ?? productResults[0]?.url ?? null;

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
		logger.error("searchAmazonProduct.failed", v.parse(thrownErrorWireSchema, error), { query });
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
			return v.parse(amazonScrapeCacheSchema, cached);
		}
	} catch (cacheError) {
		logger.warn("scrapeAmazonProduct.cacheReadFailed", {
			error: cacheError instanceof Error ? cacheError.message : "unknown",
			url,
		});
	}

	try {
		const scrapeResponse = await firecrawl.scrape(url, {
			formats: [{ schema: amazonProductSchema, type: "json" }, "rawHtml"],
		});

		const jsonData = v.parse(firecrawlAmazonJsonSchema, scrapeResponse.json ?? {});
		const html = scrapeResponse.rawHtml || "";
		const priceUsd = normalizeFirecrawlPriceUsd(jsonData.priceUsd) ?? extractAmazonPriceUsd(html);
		const imageIds = extractProductImageIds(html);
		const images = imageIds.map(toHighResUrl);

		const result = {
			extracted: toFirecrawlExtractedProduct(jsonData, images, priceUsd),
		};

		await kv().put(cacheKey, JSON.stringify(result), {
			expirationTtl: CACHE_TTL.SCRAPE,
		});

		logger.info("scrapeAmazonProduct.done", {
			elapsedMs: Date.now() - startTime,
			title: result.extracted.title,
			url,
		});

		return result;
	} catch (error) {
		logger.error("scrapeAmazonProduct.failed", v.parse(thrownErrorWireSchema, error), { url });
		return null;
	}
}

export async function resolveProductUrl(firecrawl: Firecrawl, query: string): Promise<string> {
	if (isAmazonUrl(query)) {
		return query;
	}

	const productUrl = await searchAmazonProduct(firecrawl, query);
	if (!productUrl) {
		throw new Error("Could not find product on Amazon. Try a direct URL.");
	}

	return productUrl;
}
