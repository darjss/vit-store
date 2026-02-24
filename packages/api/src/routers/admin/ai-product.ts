import { google } from "@ai-sdk/google";
import Firecrawl from "@mendable/firecrawl-js";
import { TRPCError } from "@trpc/server";
import {
	brandQueries,
	categoryQueries,
	productQueries,
} from "@vit/api/queries";
import { generateText, Output } from "ai";
import * as v from "valibot";
import { z } from "zod";
import type { Context } from "../../lib/context";
import { logger } from "../../lib/logger";
import { adminProcedure, router } from "../../lib/trpc";

// Types
export type ExtractedProductData = {
	originalTitle: string;
	originalDescription: string | null;
	originalFeatures: string[];
	originalIngredients: string[];
	name: string;
	name_mn: string;
	description: string;
	brand: string | null;
	brandId: number | null;
	categoryId: number | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
	amazonPriceUsd: number | null;
	calculatedPriceMnt: number | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
};

type FirecrawlExtractedProduct = {
	title: string;
	brand: string | null;
	description: string | null;
	features: string[];
	images: string[];
	servingSize: string | null;
	servingsPerContainer: number | null;
	ingredients: string[];
	priceUsd: number | null;
};

const PRICING_FORMULA = {
	slope: 4587,
	intercept: 16929,
	min: 40000,
	max: 500000,
	roundingStep: 500,
} as const;

type VisionAnalysisResult = {
	ingredients: string[];
	servingSize: string | null;
	dailyIntake: number | null;
	supplementFacts: string | null;
};

type TranslationResult = {
	name: string;
	name_mn: string;
	description: string;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	ingredients: string[];
	brandId: number | null;
	categoryId: number | null;
};

const imageSelectionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(8),
	primaryIndex: z.number().int().min(0).nullable(),
});

// Helper: Check if input is an Amazon URL
function isAmazonUrl(input: string): boolean {
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

// Helper: Convert Amazon image ID to high resolution URL
function toHighResUrl(imageId: string): string {
	// Clean the image ID and construct high-res URL
	const cleanId = imageId.replace(/\.[^.]+$/, ""); // Remove extension if present
	return `https://m.media-amazon.com/images/I/${cleanId}._AC_SL1500_.jpg`;
}

// Helper: Extract product image IDs from Amazon HTML
function extractProductImageIds(html: string): string[] {
	const imageIds = new Set<string>();

	// Method 1: Look for 'colorImages' or 'imageGalleryData' JSON in the page
	// Amazon stores main product images in a JS variable like: 'colorImages': {'initial': [{"hiRes":"https://...","thumb":"..."}]}
	const colorImagesMatch = html.match(
		/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/,
	);
	if (colorImagesMatch) {
		try {
			const imagesData = JSON.parse(colorImagesMatch[1]) as Array<{
				hiRes?: string;
				large?: string;
				main?: Record<string, string>;
			}>;
			for (const img of imagesData) {
				const url = img.hiRes || img.large || Object.values(img.main || {})[0];
				if (url) {
					const idMatch = url.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
					if (idMatch) imageIds.add(idMatch[1]);
				}
			}
		} catch {
			// JSON parse failed, continue to other methods
		}
	}

	// Method 2: Look for data-old-hires or data-a-dynamic-image attributes
	const hiResMatches = html.matchAll(/data-old-hires="([^"]+)"/g);
	for (const match of hiResMatches) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	// Method 3: Look for main image container images (imgTagWrapperId or main-image-container)
	const mainImageMatches = html.matchAll(
		/id="(?:imgTagWrapperId|main-image-container|landingImage)"[^>]*>[\s\S]*?src="([^"]+)"/g,
	);
	for (const match of mainImageMatches) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	// Method 4: Look for thumb images in altImages container (these correspond to main gallery)
	const altImagesSection = html.match(
		/id="altImages"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
	);
	if (altImagesSection) {
		const thumbMatches = altImagesSection[0].matchAll(
			/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g,
		);
		for (const match of thumbMatches) {
			imageIds.add(match[1]);
		}
	}

	// Method 5: Fallback - look for images with specific Amazon product image patterns
	// Main product images usually have patterns like 71XXXXX or 81XXXXX or 91XXXXX
	const productImageMatches = html.matchAll(
		/\/images\/I\/([789][0-9][A-Za-z0-9\-_+%]{5,})\._[^"]*"/g,
	);
	for (const match of productImageMatches) {
		imageIds.add(match[1]);
	}

	return Array.from(imageIds).slice(0, 10);
}

function normalizedImageKey(url: string): string {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/$/, "");
	} catch {
		return url.toLowerCase().split("?")[0] || url.toLowerCase();
	}
}

function isLikelyJunkImage(url: string): boolean {
	const u = url.toLowerCase();
	if (u.includes("thumbnail")) return true;
	if (u.includes("sprite") || u.includes("icon") || u.includes("favicon")) {
		return true;
	}
	if (
		u.includes("hero") ||
		u.includes("banner") ||
		u.includes("carousel-placeholder")
	) {
		return true;
	}
	if (u.includes("/brands/")) return true;
	return false;
}

function uniqueStable<T>(arr: T[], keyFn: (x: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of arr) {
		const key = keyFn(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

function parsePriceTokenToUsd(token: string): number | null {
	const cleaned = token.replace(/,/g, "").trim();
	if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
		return null;
	}
	const value = Number.parseFloat(cleaned);
	if (!Number.isFinite(value) || value <= 0 || value > 1000) {
		return null;
	}
	return value;
}

function extractAmazonPriceUsd(html: string): number | null {
	const patterns = [
		/"priceToPay"\s*:\s*\{[\s\S]*?"amount"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/"apex_desktop"\s*:\s*\{[\s\S]*?"amount"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/<span[^>]*class="a-price-whole"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]{0,120}?<span[^>]*class="a-price-fraction"[^>]*>\s*([0-9]{2})\s*<\/span>/i,
		/\$\s*([0-9]+(?:\.[0-9]{2})?)/,
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (!match) continue;

		if (match.length >= 3 && pattern.source.includes("a-price-whole")) {
			const whole = match[1]?.replace(/,/g, "");
			const fraction = match[2];
			const combined = `${whole}.${fraction}`;
			const parsed = parsePriceTokenToUsd(combined);
			if (parsed) return parsed;
			continue;
		}

		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) return parsed;
	}

	return null;
}

function calculatePriceMntFromUsd(amazonPriceUsd: number): number {
	const raw =
		PRICING_FORMULA.slope * amazonPriceUsd + PRICING_FORMULA.intercept;
	const bounded = Math.min(
		PRICING_FORMULA.max,
		Math.max(PRICING_FORMULA.min, raw),
	);
	return (
		Math.round(bounded / PRICING_FORMULA.roundingStep) *
		PRICING_FORMULA.roundingStep
	);
}

async function selectProductImagesWithGemini(
	productName: string,
	candidates: string[],
): Promise<{ keep: string[]; primary: string | null; usedFallback: boolean }> {
	if (candidates.length <= 1) {
		return {
			keep: candidates,
			primary: candidates[0] ?? null,
			usedFallback: false,
		};
	}

	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema: imageSelectionSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Choose the best product images for this product: ${productName}.
Keep only images that clearly show this exact product, package, label, or supplement facts.
Drop hero banners, collage strips, generic lifestyle, unrelated products, and duplicates.
Return keepIndices and primaryIndex from the provided image order. Keep max 8.`,
						},
						...candidates.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				},
			],
		});

		const keepIndices = Array.from(new Set(output?.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < candidates.length,
		);
		const keep = (keepIndices.length > 0 ? keepIndices : [0])
			.map((i) => candidates[i])
			.filter((url): url is string => typeof url === "string")
			.slice(0, 8);
		const primaryCandidate =
			output?.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < candidates.length
				? candidates[output.primaryIndex]
				: null;
		const primary =
			typeof primaryCandidate === "string"
				? primaryCandidate
				: (keep[0] ?? null);
		return { keep, primary, usedFallback: false };
	} catch {
		return {
			keep: candidates.slice(0, 8),
			primary: candidates[0] ?? null,
			usedFallback: true,
		};
	}
}

async function refineProductOnlyImagesWithGemini(
	productName: string,
	candidates: string[],
): Promise<{ keep: string[]; primary: string | null; usedFallback: boolean }> {
	if (candidates.length <= 1) {
		return {
			keep: candidates,
			primary: candidates[0] ?? null,
			usedFallback: false,
		};
	}

	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema: imageSelectionSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Second-pass strict filtering for product: ${productName}.
Keep only images where the actual product package/bottle/box is the main visible subject.
Reject images that are mostly brand logos, brand story graphics, banners, collages, badges, or unrelated items.
Prefer clear front/back/label/supplement facts shots of the same product.
Return keepIndices and primaryIndex from the given order. Keep max 8.`,
						},
						...candidates.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				},
			],
		});

		const keepIndices = Array.from(new Set(output?.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < candidates.length,
		);
		const keep = (keepIndices.length > 0 ? keepIndices : [0])
			.map((i) => candidates[i])
			.filter((url): url is string => typeof url === "string")
			.slice(0, 8);
		const primaryCandidate =
			output?.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < candidates.length
				? candidates[output.primaryIndex]
				: null;
		const primary =
			typeof primaryCandidate === "string"
				? primaryCandidate
				: (keep[0] ?? null);
		return { keep, primary, usedFallback: false };
	} catch {
		return {
			keep: candidates.slice(0, 8),
			primary: candidates[0] ?? null,
			usedFallback: true,
		};
	}
}

async function filterProductImages(
	productName: string,
	imageUrls: string[],
): Promise<{ images: string[]; usedGemini: boolean; usedFallback: boolean }> {
	const deJunk = imageUrls.filter((url) => !isLikelyJunkImage(url));
	const deduped = uniqueStable(deJunk, normalizedImageKey);

	if (deduped.length <= 1) {
		return {
			images: deduped.slice(0, 8),
			usedGemini: false,
			usedFallback: false,
		};
	}

	const picked = await selectProductImagesWithGemini(productName, deduped);
	const strictPicked = await refineProductOnlyImagesWithGemini(
		productName,
		picked.keep,
	);
	const uniquePicked = uniqueStable(
		strictPicked.keep,
		normalizedImageKey,
	).slice(0, 8);
	const primary = strictPicked.primary;
	if (!primary || uniquePicked.length === 0) {
		return {
			images: uniquePicked,
			usedGemini: true,
			usedFallback: picked.usedFallback || strictPicked.usedFallback,
		};
	}

	const primaryIndex = uniquePicked.findIndex(
		(url) => normalizedImageKey(url) === normalizedImageKey(primary),
	);
	if (primaryIndex > 0) {
		const [head] = uniquePicked.splice(primaryIndex, 1);
		if (head) uniquePicked.unshift(head);
	}

	return {
		images: uniquePicked,
		usedGemini: true,
		usedFallback: picked.usedFallback || strictPicked.usedFallback,
	};
}

// Schema for Firecrawl extract
const amazonProductSchema = {
	type: "object",
	properties: {
		title: { type: "string", description: "The product title/name" },
		brand: { type: "string", description: "The brand name of the product" },
		description: { type: "string", description: "Product description text" },
		features: {
			type: "array",
			items: { type: "string" },
			description: "Product feature bullet points",
		},
		servingSize: {
			type: "string",
			description: "Serving size info (e.g., '1 capsule', '2 softgels')",
		},
		servingsPerContainer: {
			type: "number",
			description: "Number of servings per container",
		},
		ingredients: {
			type: "array",
			items: { type: "string" },
			description: "List of ingredients with amounts",
		},
	},
	required: ["title"],
};

// Helper: Search for Amazon product using Firecrawl
async function searchAmazonProduct(
	firecrawl: Firecrawl,
	query: string,
): Promise<string | null> {
	logger.info("searchAmazonProduct", { query });
	try {
		const searchResponse = await firecrawl.search(`site:amazon.com ${query}`, {
			limit: 5,
		});

		if (!searchResponse.web?.length) {
			logger.info("searchAmazonProduct", {
				message: "No search results found",
			});
			return null;
		}

		for (const result of searchResponse.web) {
			const url = "url" in result ? result.url : undefined;
			if (url && (url.includes("/dp/") || url.includes("/gp/product/"))) {
				logger.info("searchAmazonProduct", {
					message: "Found product URL",
					url,
				});
				return url;
			}
		}

		const firstResult = searchResponse.web[0];
		const firstUrl = "url" in firstResult ? firstResult.url : undefined;
		if (firstUrl?.includes("amazon.com")) {
			return firstUrl;
		}

		return null;
	} catch (error) {
		logger.error("searchAmazonProduct", error);
		return null;
	}
}

// Helper: Scrape Amazon product page
async function scrapeAmazonProduct(
	firecrawl: Firecrawl,
	url: string,
): Promise<{ extracted: FirecrawlExtractedProduct } | null> {
	logger.info("scrapeAmazonProduct", { url });
	try {
		// Get both JSON extraction and HTML for image parsing
		const scrapeResponse = await firecrawl.scrape(url, {
			formats: [{ type: "json", schema: amazonProductSchema }, "html"],
		});

		const jsonData = (scrapeResponse.json as Record<string, unknown>) || {};
		const html = scrapeResponse.html || "";
		const priceUsd = extractAmazonPriceUsd(html);

		logger.info("scrapeAmazonProduct", {
			message: "Firecrawl extracted",
			title: jsonData.title,
			brand: jsonData.brand,
			priceUsd,
			ingredientsCount: (jsonData.ingredients as string[])?.length || 0,
			htmlLength: html.length,
		});

		// Extract product images from HTML (more reliable than images format)
		const imageIds = extractProductImageIds(html);
		const images = imageIds.map(toHighResUrl);
		logger.info("scrapeAmazonProduct", {
			message: `Extracted ${images.length} product images from HTML`,
		});

		return {
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
	} catch (error) {
		logger.error("scrapeAmazonProduct", error);
		return null;
	}
}

// Helper: Analyze product images with Gemini Vision
async function analyzeProductImages(
	imageUrls: string[],
): Promise<VisionAnalysisResult> {
	const imagesToAnalyze = imageUrls.slice(0, 4);
	logger.info("analyzeProductImages", {
		message: `Analyzing ${imagesToAnalyze.length} images with Gemini`,
	});

	if (imagesToAnalyze.length === 0) {
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}

	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({
				schema: z.object({
					ingredients: z
						.array(z.string())
						.describe(
							"List of ingredients with amounts, e.g. 'Vitamin D3 - 5000 IU (625%)'",
						),
					servingSize: z
						.string()
						.nullable()
						.describe("Serving size, e.g. '1 softgel'"),
					dailyIntake: z
						.number()
						.nullable()
						.describe("How many to take per day"),
					supplementFacts: z
						.string()
						.nullable()
						.describe("Raw supplement facts text if visible"),
				}),
			}),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Analyze these supplement product images. Extract:
1. ALL ingredients from the Supplement Facts label with amounts and % Daily Value
2. Serving size
3. Daily intake (how many per day)

Format ingredients as: "Ingredient Name - Amount (% Daily Value)"
Example: "Vitamin D3 - 5000 IU (625%)"`,
						},
						...imagesToAnalyze.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				},
			],
		});

		logger.info("analyzeProductImages", {
			message: "Vision result",
			ingredientsCount: output?.ingredients?.length || 0,
			servingSize: output?.servingSize,
			dailyIntake: output?.dailyIntake,
		});

		return {
			ingredients: output?.ingredients || [],
			servingSize: output?.servingSize || null,
			dailyIntake: output?.dailyIntake || null,
			supplementFacts: output?.supplementFacts || null,
		};
	} catch (error) {
		logger.error("analyzeProductImages", error);
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}
}

// Helper: Translate and structure product data with Gemini
async function translateAndStructureProduct(
	extractedData: FirecrawlExtractedProduct,
	visionData: VisionAnalysisResult,
	brands: { id: number; name: string }[],
	categories: { id: number; name: string }[],
): Promise<TranslationResult | null> {
	logger.info("translateAndStructureProduct", {
		message: "Translating product data...",
	});

	const allIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	try {
		const brandList = brands.map((b) => `  ID ${b.id}: ${b.name}`).join("\n");
		const categoryList = categories
			.map((c) => `  ID ${c.id}: ${c.name}`)
			.join("\n");

		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({
				schema: z.object({
					name: z.string().describe("Clean product name without brand"),
					name_mn: z.string().describe("Product name in Mongolian Cyrillic"),
					description: z
						.string()
						.describe("Product description in Mongolian Cyrillic"),
					amount: z.string().describe("Count/quantity, e.g. '120 Softgels'"),
					potency: z
						.string()
						.describe("Strength/potency, e.g. '5000 IU', '1000mg'"),
					dailyIntake: z.number().describe("Pills per day"),
					weightGrams: z
						.number()
						.describe("Estimated shipping weight in grams"),
					seoTitle: z
						.string()
						.describe("SEO title with Mongolian + English for search"),
					seoDescription: z
						.string()
						.describe("SEO description with Mongolian + English for search"),
					ingredients: z
						.array(z.string())
						.describe("Ingredients in Mongolian Cyrillic"),
					brandId: z
						.number()
						.nullable()
						.describe(
							"The ID of the matching brand from the BRANDS list, or null if no match",
						),
					categoryId: z
						.number()
						.nullable()
						.describe(
							"The ID of the best matching category from the CATEGORIES list, or null if no match",
						),
				}),
			}),
			prompt: `You are a product specialist for a Mongolian supplement store. Translate this product for Mongolian customers who search in both Cyrillic and Latin scripts.

PRODUCT: ${extractedData.title}
BRAND: ${extractedData.brand || "Unknown"}

FEATURES:
${extractedData.features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

DESCRIPTION: ${extractedData.description || "N/A"}

INGREDIENTS: ${allIngredients.length > 0 ? allIngredients.join("\n") : "Not found"}

SERVING INFO:
- Size: ${visionData.servingSize || extractedData.servingSize || "Unknown"}
- Per Day: ${visionData.dailyIntake || "Unknown"}
- Per Container: ${extractedData.servingsPerContainer || "Unknown"}

AVAILABLE BRANDS (match the product brand to one of these by ID):
${brandList || "  (no brands available)"}

AVAILABLE CATEGORIES (pick the best matching category by ID):
${categoryList || "  (no categories available)"}

INSTRUCTIONS:
1. name: Clean English product name (no brand). Example: "Berberine 1500mg 240 Veggie Capsules"
2. name_mn: Mongolian Cyrillic name. Example: "Берберин 1500мг 240 Ургамлын Капсул"
3. description: Mongolian Cyrillic description (2-3 sentences about benefits)
4. seoTitle: Mix of Mongolian Cyrillic AND English for SEO. Include brand in both scripts.
   Example: "НэйчерБэлл Берберин 1500мг | NatureBell Berberine Supplement"
5. seoDescription: Mongolian Cyrillic with key English terms mixed in for search visibility.
   Example: "НэйчерБэлл (NatureBell) Берберин 1500mg нэмэлт тэжээл. Blood sugar, heart health дэмжинэ. 240 capsules, 80 өдрийн хэрэглээ."
6. ingredients: Mongolian Cyrillic, keep amounts. Example: "Берберин HCl - 1500мг"
7. Extract amount (e.g. "240 Veggie Capsules") and potency (e.g. "1500mg") from title
8. brandId: Match the product brand "${extractedData.brand || "Unknown"}" to one of the AVAILABLE BRANDS above. Use exact or fuzzy name matching (e.g. "NOW Foods" matches "Now Foods"). Return the brand ID or null if no match.
9. categoryId: Based on the product type and ingredients, pick the single best matching category from AVAILABLE CATEGORIES above. Return the category ID or null if no match.`,
		});

		logger.info("translateAndStructureProduct", {
			message: "Translation complete",
			name: output?.name,
			amount: output?.amount,
			potency: output?.potency,
			brandId: output?.brandId,
			categoryId: output?.categoryId,
		});

		return output ?? null;
	} catch (error) {
		logger.error("translateAndStructureProduct", error);
		return null;
	}
}

// Helper: Upload images to R2
async function uploadImagesToR2(
	imageUrls: string[],
	ctx: Context,
): Promise<{ url: string }[]> {
	const CDN_BASE_URL = "https://cdn.darjs.dev";
	const uploadPrefix = "products/catalog";
	const sampleImageHosts = Array.from(
		new Set(
			imageUrls
				.slice(0, 5)
				.map((url) => {
					try {
						return new URL(url).hostname;
					} catch {
						return "invalid-url";
					}
				})
				.filter((host) => host.length > 0),
		),
	);

	logger.info("uploadImagesToR2", {
		operation: "ai_image_upload",
		message: "Uploading AI product images directly to R2",
		imageCount: imageUrls.length,
		sampleImageHosts,
	});

	const uploadedImages: { url: string }[] = [];
	const skippedImages: { url: string; reason: string }[] = [];

	try {
		for (const sourceUrl of imageUrls) {
			try {
				const response = await fetch(sourceUrl, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						Accept: "image/*",
					},
					signal: AbortSignal.timeout(15000),
				});

				if (!response.ok) {
					skippedImages.push({
						url: sourceUrl,
						reason: `fetch_status_${response.status}`,
					});
					continue;
				}

				const contentType = response.headers.get("content-type") || "";
				if (!contentType.startsWith("image/")) {
					skippedImages.push({
						url: sourceUrl,
						reason: "invalid_content_type",
					});
					continue;
				}

				const rawExt = contentType.includes("png")
					? "png"
					: contentType.includes("gif")
						? "gif"
						: contentType.includes("webp")
							? "webp"
							: "jpg";
				const generatedId = crypto.randomUUID().replace(/-/g, "");
				let key = `${uploadPrefix}/${generatedId}.webp`;

				const imageArrayBuffer = await response.arrayBuffer();
				const imageBlob = new Blob([imageArrayBuffer], { type: contentType });

				let wroteWithTransform = false;
				try {
					const transformed = await ctx.c.env.images
						.input(imageBlob.stream())
						.transform({
							width: 800,
							height: 600,
							fit: "contain",
						})
						.output({ format: "image/webp" });

					const transformedBuffer = await transformed.response().arrayBuffer();

					await ctx.c.env.r2Bucket.put(key, transformedBuffer, {
						httpMetadata: { contentType: "image/webp" },
					});
					wroteWithTransform = true;
				} catch {
					key = `${uploadPrefix}/${generatedId}.${rawExt}`;
					await ctx.c.env.r2Bucket.put(key, imageArrayBuffer, {
						httpMetadata: { contentType },
					});
				}

				uploadedImages.push({ url: `${CDN_BASE_URL}/${key}` });

				logger.debug("uploadImagesToR2.imageProcessed", {
					operation: "ai_image_upload",
					sourceHost: (() => {
						try {
							return new URL(sourceUrl).hostname;
						} catch {
							return "invalid-url";
						}
					})(),
					storedKey: key,
					usedTransform: wroteWithTransform,
				});
			} catch (imageError) {
				skippedImages.push({
					url: sourceUrl,
					reason: imageError instanceof Error ? imageError.message : "unknown",
				});
			}
		}

		logger.info("uploadImagesToR2", {
			operation: "ai_image_upload",
			message: `Uploaded ${uploadedImages.length} of ${imageUrls.length} images`,
			uploadedCount: uploadedImages.length,
			skippedCount: skippedImages.length,
			skippedReasons: skippedImages.slice(0, 5),
		});

		return uploadedImages;
	} catch (error) {
		logger.error("uploadImagesToR2", error, {
			operation: "ai_image_upload",
			message: "Direct upload process failed",
			imageCount: imageUrls.length,
			sampleImageHosts,
			fallbackToSourceUrls: false,
		});
		return [];
	}
}

async function extractAndUploadProductImages(
	ctx: Context,
	query: string,
): Promise<{ images: { url: string }[]; sourceUrl: string }> {
	const firecrawlApiKey = ctx.c.env.FIRECRAWL_API_KEY;
	if (!firecrawlApiKey) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Firecrawl API key not configured",
		});
	}

	const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
	const productUrl = isAmazonUrl(query)
		? query
		: await searchAmazonProduct(firecrawl, query);

	if (!productUrl) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Could not find product on Amazon. Try a direct URL.",
		});
	}

	const scrapeResult = await scrapeAmazonProduct(firecrawl, productUrl);
	if (!scrapeResult?.extracted.title) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to scrape product page.",
		});
	}

	const imageFilter = await filterProductImages(
		scrapeResult.extracted.title,
		scrapeResult.extracted.images,
	);
	if (imageFilter.images.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Could not extract usable product images from Amazon listing.",
		});
	}

	const uploadedImages = await uploadImagesToR2(imageFilter.images, ctx);

	return {
		images: uploadedImages,
		sourceUrl: productUrl,
	};
}

// Main router
export const aiProduct = router({
	extractProduct: adminProcedure
		.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
		.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
			return extractProductFromQuery(ctx, input.query);
		}),
	regenerateProductImages: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				query: v.optional(v.pipe(v.string(), v.minLength(3))),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const product = await productQueries.admin.getProductById(
				input.productId,
			);
			if (!product) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Product not found",
				});
			}

			const query =
				input.query?.trim() ||
				[product.brand?.name, product.name, product.potency, product.amount]
					.filter((part): part is string => !!part && part.trim().length > 0)
					.join(" ")
					.trim();
			const result = await extractAndUploadProductImages(ctx, query);

			await productQueries.admin.softDeleteProductImages(input.productId);
			await productQueries.admin.createProductImages(
				input.productId,
				result.images.map((image, index) => ({
					url: image.url,
					isPrimary: index === 0,
				})),
			);

			return {
				images: result.images,
				sourceUrl: result.sourceUrl,
				count: result.images.length,
			};
		}),
});

export async function extractProductFromQuery(
	ctx: Context,
	query: string,
): Promise<ExtractedProductData> {
	const errors: string[] = [];
	let extractionStatus: "success" | "partial" | "failed" = "success";

	logger.info("extractProductFromQuery", { query });

	const firecrawlApiKey = ctx.c.env.FIRECRAWL_API_KEY;
	if (!firecrawlApiKey) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Firecrawl API key not configured",
		});
	}

	// Note: Google API key is read automatically from GOOGLE_GENERATIVE_AI_API_KEY env var
	const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });

	// Step 1: Get product URL
	let productUrl: string | null = null;
	if (isAmazonUrl(query)) {
		productUrl = query;
	} else {
		productUrl = await searchAmazonProduct(firecrawl, query);
		if (!productUrl) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Could not find product on Amazon. Try a direct URL.",
			});
		}
	}

	// Step 2: Scrape product page
	const scrapeResult = await scrapeAmazonProduct(firecrawl, productUrl);
	if (!scrapeResult?.extracted.title) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to scrape product page.",
		});
	}

	const { extracted: extractedData } = scrapeResult;
	const calculatedPriceMnt =
		typeof extractedData.priceUsd === "number"
			? calculatePriceMntFromUsd(extractedData.priceUsd)
			: null;
	if (calculatedPriceMnt == null) {
		errors.push("Could not extract Amazon USD price.");
		extractionStatus = "partial";
	}

	logger.info("extractProductFromQuery", {
		message: "Extracted",
		title: extractedData.title,
		brand: extractedData.brand,
		imagesCount: extractedData.images.length,
	});

	const imageFilter = await filterProductImages(
		extractedData.title,
		extractedData.images,
	);
	const filteredImages = imageFilter.images;
	logger.info("extractProductFromQuery", {
		message: "Image filtering",
		before: extractedData.images.length,
		after: filteredImages.length,
		usedGemini: imageFilter.usedGemini,
		usedFallback: imageFilter.usedFallback,
	});
	if (filteredImages.length === 0 && extractedData.images.length > 0) {
		errors.push("Image filtering removed all candidates.");
		extractionStatus = "partial";
	}

	// Step 3: Analyze images with Gemini Vision
	let visionData: VisionAnalysisResult = {
		ingredients: [],
		servingSize: null,
		dailyIntake: null,
		supplementFacts: null,
	};

	if (filteredImages.length > 0) {
		visionData = await analyzeProductImages(filteredImages);
		if (
			visionData.ingredients.length === 0 &&
			extractedData.ingredients.length === 0
		) {
			errors.push("Could not extract ingredients from images.");
			extractionStatus = "partial";
		}
	} else {
		errors.push("No product images found.");
		extractionStatus = "partial";
	}

	// Step 4: Translate and structure (fetch brands/categories for LLM matching)
	const [allBrands, allCategories] = await Promise.all([
		brandQueries.admin.getAllBrands(),
		categoryQueries.admin.getAllCategories(),
	]);
	const structuredData = await translateAndStructureProduct(
		extractedData,
		visionData,
		allBrands.map((b) => ({ id: b.id, name: b.name })),
		allCategories.map((c) => ({ id: c.id, name: c.name })),
	);
	const validBrandIds = new Set(allBrands.map((b) => b.id));
	const validCategoryIds = new Set(allCategories.map((c) => c.id));
	const matchedBrandId =
		structuredData?.brandId != null && validBrandIds.has(structuredData.brandId)
			? structuredData.brandId
			: null;
	const matchedCategoryId =
		structuredData?.categoryId != null &&
		validCategoryIds.has(structuredData.categoryId)
			? structuredData.categoryId
			: null;
	if (!structuredData) {
		errors.push("Translation failed. Using raw data.");
		extractionStatus = "partial";
	}

	// Step 5: Upload images
	let uploadedImages: { url: string }[] = [];
	if (filteredImages.length > 0) {
		uploadedImages = await uploadImagesToR2(filteredImages, ctx);

		if (uploadedImages.length === 0) {
			logger.warn("extractProductFromQuery.imageUploadFailed", {
				message: "No images were uploaded to CDN",
				requestedCount: filteredImages.length,
				sourceHosts: Array.from(
					new Set(
						filteredImages.slice(0, 5).map((url) => {
							try {
								return new URL(url).hostname;
							} catch {
								return "invalid-url";
							}
						}),
					),
				),
			});
			errors.push("Image upload failed. No images were imported.");
			extractionStatus = "partial";
		}

		if (filteredImages.every((url, i) => url === uploadedImages[i]?.url)) {
			logger.warn("extractProductFromQuery.imageUploadFallback", {
				message: "All uploaded image URLs matched source URLs; using fallback",
				requestedCount: filteredImages.length,
				uploadedCount: uploadedImages.length,
				sourceHosts: Array.from(
					new Set(
						filteredImages.slice(0, 5).map((url) => {
							try {
								return new URL(url).hostname;
							} catch {
								return "invalid-url";
							}
						}),
					),
				),
				uploadedHosts: Array.from(
					new Set(
						uploadedImages.slice(0, 5).map((image) => {
							try {
								return new URL(image.url).hostname;
							} catch {
								return "invalid-url";
							}
						}),
					),
				),
			});
			errors.push("Image upload failed. Using Amazon URLs.");
			extractionStatus = "partial";
		}
	}

	const allOriginalIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	const response: ExtractedProductData = {
		originalTitle: extractedData.title,
		originalDescription: extractedData.description,
		originalFeatures: extractedData.features,
		originalIngredients: allOriginalIngredients,
		name: structuredData?.name || extractedData.title,
		name_mn: structuredData?.name_mn || `${extractedData.title} (орчуулаагүй)`,
		description:
			structuredData?.description ||
			extractedData.description ||
			"Тайлбар байхгүй",
		brand: extractedData.brand,
		brandId: matchedBrandId,
		categoryId: matchedCategoryId,
		amount: structuredData?.amount || "Unknown",
		potency: structuredData?.potency || "Unknown",
		dailyIntake: structuredData?.dailyIntake || visionData.dailyIntake || 1,
		weightGrams: structuredData?.weightGrams || 200,
		seoTitle: structuredData?.seoTitle || extractedData.title.slice(0, 60),
		seoDescription:
			structuredData?.seoDescription ||
			(extractedData.description || "").slice(0, 155),
		ingredients: structuredData?.ingredients || allOriginalIngredients,
		images: uploadedImages,
		sourceUrl: productUrl,
		amazonPriceUsd: extractedData.priceUsd,
		calculatedPriceMnt,
		extractionStatus,
		errors,
	};

	logger.info("extractProductFromQuery", {
		message: "Done",
		status: extractionStatus,
		errorsCount: errors.length,
	});
	return response;
}
