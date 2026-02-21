import { google } from "@ai-sdk/google";
import Firecrawl from "@mendable/firecrawl-js";
import { TRPCError } from "@trpc/server";
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
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
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
};

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
			.map((i) => candidates[i]!)
			.slice(0, 8);
		const primary =
			output?.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < candidates.length
				? candidates[output.primaryIndex]!
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
	const uniquePicked = uniqueStable(picked.keep, normalizedImageKey).slice(
		0,
		8,
	);
	const primary = picked.primary;
	if (!primary || uniquePicked.length === 0) {
		return {
			images: uniquePicked,
			usedGemini: true,
			usedFallback: picked.usedFallback,
		};
	}

	const primaryIndex = uniquePicked.findIndex(
		(url) => normalizedImageKey(url) === normalizedImageKey(primary),
	);
	if (primaryIndex > 0) {
		const [head] = uniquePicked.splice(primaryIndex, 1);
		uniquePicked.unshift(head!);
	}

	return {
		images: uniquePicked,
		usedGemini: true,
		usedFallback: picked.usedFallback,
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

		logger.info("scrapeAmazonProduct", {
			message: "Firecrawl extracted",
			title: jsonData.title,
			brand: jsonData.brand,
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
): Promise<TranslationResult | null> {
	logger.info("translateAndStructureProduct", {
		message: "Translating product data...",
	});

	const allIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	try {
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

INSTRUCTIONS:
1. name: Clean English product name (no brand). Example: "Berberine 1500mg 240 Veggie Capsules"
2. name_mn: Mongolian Cyrillic name. Example: "Берберин 1500мг 240 Ургамлын Капсул"
3. description: Mongolian Cyrillic description (2-3 sentences about benefits)
4. seoTitle: Mix of Mongolian Cyrillic AND English for SEO. Include brand in both scripts.
   Example: "НэйчерБэлл Берберин 1500мг | NatureBell Berberine Supplement"
5. seoDescription: Mongolian Cyrillic with key English terms mixed in for search visibility.
   Example: "НэйчерБэлл (NatureBell) Берберин 1500mg нэмэлт тэжээл. Blood sugar, heart health дэмжинэ. 240 capsules, 80 өдрийн хэрэглээ."
6. ingredients: Mongolian Cyrillic, keep amounts. Example: "Берберин HCl - 1500мг"
7. Extract amount (e.g. "240 Veggie Capsules") and potency (e.g. "1500mg") from title`,
		});

		logger.info("translateAndStructureProduct", {
			message: "Translation complete",
			name: output?.name,
			amount: output?.amount,
			potency: output?.potency,
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
	backendUrl: string,
): Promise<{ url: string }[]> {
	logger.info("uploadImagesToR2", {
		message: `Uploading ${imageUrls.length} images to ${backendUrl}`,
	});
	try {
		const response = await fetch(`${backendUrl}/upload/images/urls`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(imageUrls.map((url) => ({ url }))),
		});

		if (!response.ok) {
			logger.error("uploadImagesToR2", {
				message: `Upload failed: ${response.status}`,
			});
			return imageUrls.map((url) => ({ url }));
		}

		const result = (await response.json()) as { images: { url: string }[] };
		logger.info("uploadImagesToR2", {
			message: `Uploaded ${result.images.length} images`,
		});
		return result.images;
	} catch (error) {
		logger.error("uploadImagesToR2", error);
		return imageUrls.map((url) => ({ url }));
	}
}

// Main router
export const aiProduct = router({
	extractProduct: adminProcedure
		.input(v.object({ query: v.pipe(v.string(), v.minLength(3)) }))
		.mutation(async ({ ctx, input }): Promise<ExtractedProductData> => {
			return extractProductFromQuery(ctx, input.query);
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

	// Step 4: Translate and structure
	const structuredData = await translateAndStructureProduct(
		extractedData,
		visionData,
	);
	if (!structuredData) {
		errors.push("Translation failed. Using raw data.");
		extractionStatus = "partial";
	}

	// Step 5: Upload images
	let uploadedImages: { url: string }[] = [];
	if (filteredImages.length > 0) {
		const requestUrl = new URL(ctx.c.req.url);
		const backendUrl = `${requestUrl.protocol}//${requestUrl.host}`;
		uploadedImages = await uploadImagesToR2(filteredImages, backendUrl);

		if (filteredImages.every((url, i) => url === uploadedImages[i]?.url)) {
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
