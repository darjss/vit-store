import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import Firecrawl from "@mendable/firecrawl-js";
import { generateText, Output } from "ai";
import { config } from "dotenv";
import postgres from "postgres";
import { z } from "zod";

config({ path: ".env" });

// --- Config ---

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const BUCKET = process.env.R2_BUCKET_NAME ?? "vit-store-bucket-prod";
const CDN_BASE_URL = process.env.CDN_BASE_URL ?? "https://cdn.darjs.dev";
const OUT_DIR = "tmp/stock-product-images";
const REPORT_PATH = "tmp/stock-products-report.json";

const opencode = createOpenAICompatible({
	baseURL: "https://opencode.ai/zen/go/v1",
	apiKey: process.env.OPENCODE_GO_API_KEY,
	name: "opencode-go",
	supportsStructuredOutputs: true,
});

// --- Types ---

type StockItem = {
	index: number;
	amazonUrl: string;
	stock: number;
	price: number;
};

type ScrapeResult = {
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

type VisionAnalysisResult = {
	ingredients: string[];
	servingSize: string | null;
	dailyIntake: number | null;
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

type ProductResult = {
	index: number;
	amazonUrl: string;
	status: "created" | "duplicate_flag" | "failed";
	productId?: number;
	slug?: string;
	error?: string;
};

// --- Amazon helpers (same as ai-product.ts) ---

function toHighResUrl(imageId: string): string {
	const cleanId = imageId.replace(/\.[^.]+$/, "");
	return `https://m.media-amazon.com/images/I/${cleanId}._AC_SL1500_.jpg`;
}

function extractProductImageIds(html: string): string[] {
	const imageIds = new Set<string>();

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
			// continue
		}
	}

	for (const match of html.matchAll(/data-old-hires="([^"]+)"/g)) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	for (const match of html.matchAll(
		/id="(?:imgTagWrapperId|main-image-container|landingImage)"[^>]*>[\s\S]*?src="([^"]+)"/g,
	)) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	const altImagesSection = html.match(
		/id="altImages"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
	);
	if (altImagesSection) {
		for (const match of altImagesSection[0].matchAll(
			/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g,
		)) {
			imageIds.add(match[1]);
		}
	}

	for (const match of html.matchAll(
		/\/images\/I\/([789][0-9][A-Za-z0-9\-_+%]{5,})\._[^"]*"/g,
	)) {
		imageIds.add(match[1]);
	}

	return Array.from(imageIds).slice(0, 10);
}

function parsePriceTokenToUsd(token: string): number | null {
	const cleaned = token.replace(/,/g, "").trim();
	if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
	const value = Number.parseFloat(cleaned);
	if (!Number.isFinite(value) || value <= 0 || value > 1000) return null;
	return value;
}

function extractAmazonPriceUsd(html: string): number | null {
	const candidates: number[] = [];
	const preferredPatterns = [
		/apex-pricetopay-value[\s\S]{0,300}?class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/apex-pricetopay-accessibility-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/data-pricetopay-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/['"]priceToPay['"]\s*:\s*\{[\s\S]*?['"]amount['"]\s*:\s*['"]?([0-9]+(?:\.[0-9]{1,2})?)['"]?/i,
		/<span[^>]*class="a-price-whole"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]{0,120}?<span[^>]*class="a-price-fraction"[^>]*>\s*([0-9]{2})\s*<\/span>/i,
	];

	for (const pattern of preferredPatterns) {
		const match = html.match(pattern);
		if (!match) continue;
		if (match.length >= 3 && pattern.source.includes("a-price-whole")) {
			const parsed = parsePriceTokenToUsd(
				`${(match[1] || "").replace(/,/g, "")}.${match[2] || "00"}`,
			);
			if (parsed) candidates.push(parsed);
			continue;
		}
		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) candidates.push(parsed);
	}

	const preferred = candidates.filter((v) => v >= 5 && v <= 300);
	if (preferred.length > 0) return Math.min(...preferred);

	const fallback = Array.from(
		html.matchAll(
			/class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{2})?)/g,
		),
	)
		.map((m) => parsePriceTokenToUsd(m[1] ?? ""))
		.filter((v): v is number => v != null && v >= 5 && v <= 300)
		.slice(0, 10);

	return fallback.length > 0 ? Math.min(...fallback) : null;
}

// --- Image dedup/filter helpers ---

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
	if (u.includes("sprite") || u.includes("icon") || u.includes("favicon"))
		return true;
	if (
		u.includes("hero") ||
		u.includes("banner") ||
		u.includes("carousel-placeholder")
	)
		return true;
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

// --- AI: Filter product images ---

const imageSelectionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(8),
	primaryIndex: z.number().int().min(0).nullable(),
});

async function filterProductImages(
	productName: string,
	imageUrls: string[],
): Promise<string[]> {
	const deJunk = imageUrls.filter((url) => !isLikelyJunkImage(url));
	const deduped = uniqueStable(deJunk, normalizedImageKey);
	if (deduped.length <= 1) return deduped.slice(0, 8);

	const candidates = deduped.slice(0, 6);
	try {
		const { output } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({ schema: imageSelectionSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Product: ${productName}

Filter these images. KEEP images that show:
- Product packaging, bottle, box, container
- Supplement facts label, ingredient list
- Product interior (capsules, tablets, powder, liquid)
- Close-ups of the product itself

REMOVE only:
- Completely unrelated products
- Generic lifestyle/landscape photos with no product
- Brand logos or banners with no product visible
- Exact duplicates (same image URL)

Be lenient - when in doubt, keep the image. Return keepIndices and primaryIndex (best hero shot).`,
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

		// Move primary to front
		if (primary) {
			const primaryIndex = keep.findIndex(
				(url) => normalizedImageKey(url) === normalizedImageKey(primary),
			);
			if (primaryIndex > 0) {
				const [head] = keep.splice(primaryIndex, 1);
				if (head) keep.unshift(head);
			}
		}

		return uniqueStable(keep, normalizedImageKey).slice(0, 8);
	} catch (err) {
		console.warn(
			"  Image filter AI failed, using first 6:",
			err instanceof Error ? err.message : err,
		);
		return deduped.slice(0, 8);
	}
}

// --- AI: Analyze product images ---

async function analyzeProductImages(
	imageUrls: string[],
): Promise<VisionAnalysisResult> {
	const imagesToAnalyze = imageUrls.slice(0, 4);
	if (imagesToAnalyze.length === 0) {
		return { ingredients: [], servingSize: null, dailyIntake: null };
	}

	try {
		const { output } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({
				schema: z.object({
					ingredients: z
						.array(z.string())
						.describe("List of ingredients with amounts"),
					servingSize: z
						.string()
						.nullable()
						.describe("Serving size, e.g. '1 softgel'"),
					dailyIntake: z
						.number()
						.nullable()
						.describe("How many to take per day"),
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

		return {
			ingredients: output?.ingredients || [],
			servingSize: output?.servingSize || null,
			dailyIntake: output?.dailyIntake || null,
		};
	} catch (err) {
		console.warn(
			"  Vision analysis failed:",
			err instanceof Error ? err.message : err,
		);
		return { ingredients: [], servingSize: null, dailyIntake: null };
	}
}

// --- AI: Translate and structure product ---

async function translateAndStructureProduct(
	extracted: ScrapeResult,
	vision: VisionAnalysisResult,
	brands: { id: number; name: string }[],
	categories: { id: number; name: string }[],
): Promise<TranslationResult | null> {
	const allIngredients = [
		...new Set([...extracted.ingredients, ...vision.ingredients]),
	];

	try {
		const brandList = brands.map((b) => `  ID ${b.id}: ${b.name}`).join("\n");
		const categoryList = categories
			.map((c) => `  ID ${c.id}: ${c.name}`)
			.join("\n");

		const { output } = await generateText({
			model: opencode("kimi-k2.5"),
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
						.describe("The ID of the matching brand, or null"),
					categoryId: z
						.number()
						.nullable()
						.describe("The ID of the best matching category, or null"),
				}),
			}),
			prompt: `You are a product specialist for a Mongolian supplement store. Translate this product for Mongolian customers who search in both Cyrillic and Latin scripts.

PRODUCT: ${extracted.title}
BRAND: ${extracted.brand || "Unknown"}

FEATURES:
${extracted.features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

DESCRIPTION: ${extracted.description || "N/A"}

INGREDIENTS: ${allIngredients.length > 0 ? allIngredients.join("\n") : "Not found"}

SERVING INFO:
- Size: ${vision.servingSize || extracted.servingSize || "Unknown"}
- Per Day: ${vision.dailyIntake || "Unknown"}
- Per Container: ${extracted.servingsPerContainer || "Unknown"}

AVAILABLE BRANDS (match the product brand to one of these by ID):
${brandList || "  (no brands available)"}

AVAILABLE CATEGORIES (pick the best matching category by ID):
${categoryList || "  (no categories available)"}

INSTRUCTIONS:
1. name: Clean English product name (no brand). Example: "Berberine 1500mg 240 Veggie Capsules"
2. name_mn: Mongolian Cyrillic name. Example: "Берберин 1500мг 240 Ургамлын Капсул"
3. description: Mongolian Cyrillic description (2-3 sentences about benefits)
4. seoTitle: Mix of Mongolian Cyrillic AND English for SEO. Include brand in both scripts.
5. seoDescription: Mongolian Cyrillic with key English terms mixed in for search visibility.
6. ingredients: Mongolian Cyrillic, keep amounts. Example: "Берберин HCl - 1500мг"
7. Extract amount (e.g. "240 Veggie Capsules") and potency (e.g. "1500mg") from title
8. brandId: Match the product brand "${extracted.brand || "Unknown"}" to one of the AVAILABLE BRANDS above. Return the brand ID or null if no match.
9. categoryId: Based on the product type and ingredients, pick the single best matching category from AVAILABLE CATEGORIES above. Return the category ID or null if no match.`,
		});

		return output ?? null;
	} catch (err) {
		console.warn(
			"  Translation failed:",
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

// --- Brand resolution ---

function normalizeBrandName(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function resolveOrCreateBrandId(
	sql: postgres.Sql,
	brandName: string | null,
	brands: { id: number; name: string }[],
): Promise<number | null> {
	if (!brandName?.trim()) return null;

	const normalizedTarget = normalizeBrandName(brandName);
	const existing = brands.find(
		(b) => normalizeBrandName(b.name) === normalizedTarget,
	);
	if (existing) return existing.id;

	const cleanBrandName = brandName.trim().replace(/\s+/g, " ");
	try {
		const result = await sql<{ id: number }[]>`
			insert into ecom_vit_brand (name, logo_url, created_at)
			values (${cleanBrandName}, '', now())
			returning id
		`;
		const newId = result[0]?.id ?? null;
		if (newId) brands.push({ id: newId, name: cleanBrandName });
		console.log(`  Created brand "${cleanBrandName}" (id: ${newId})`);
		return newId;
	} catch {
		// Conflict — re-fetch
		const refreshed = await sql<{ id: number; name: string }[]>`
			select id, name from ecom_vit_brand where deleted_at is null
		`;
		const matched = refreshed.find(
			(b) => normalizeBrandName(b.name) === normalizedTarget,
		);
		return matched?.id ?? null;
	}
}

// --- Image download + R2 upload ---

async function downloadImage(
	url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				Accept: "image/*",
			},
			signal: AbortSignal.timeout(15000),
		});
		if (!res.ok) return null;
		const contentType = res.headers.get("content-type") || "";
		if (!contentType.startsWith("image/")) return null;
		const bytes = new Uint8Array(await res.arrayBuffer());
		return { bytes, contentType };
	} catch {
		return null;
	}
}

function uploadWithWrangler(
	localPath: string,
	key: string,
	contentType: string,
): boolean {
	const result = spawnSync(
		"wrangler",
		[
			"r2",
			"object",
			"put",
			`${BUCKET}/${key}`,
			"--file",
			localPath,
			"--content-type",
			contentType,
			"--remote",
		],
		{ encoding: "utf8" },
	);
	return result.status === 0;
}

function extFromContentType(contentType: string): string {
	if (contentType.includes("png")) return "png";
	if (contentType.includes("gif")) return "gif";
	if (contentType.includes("webp")) return "webp";
	return "jpg";
}

async function uploadImagesToR2(
	imageUrls: string[],
): Promise<{ url: string }[]> {
	const uploaded: { url: string }[] = [];

	for (const sourceUrl of imageUrls) {
		const img = await downloadImage(sourceUrl);
		if (!img) {
			console.log(
				`    SKIP image (download failed): ${sourceUrl.slice(0, 80)}`,
			);
			continue;
		}

		const ext = extFromContentType(img.contentType);
		const id = randomUUID().replace(/-/g, "");
		const key = `products/catalog/${id}.${ext}`;
		const localPath = join(OUT_DIR, `${id}.${ext}`);

		await writeFile(localPath, img.bytes);
		const ok = uploadWithWrangler(localPath, key, img.contentType);
		if (ok) {
			uploaded.push({ url: `${CDN_BASE_URL}/${key}` });
		} else {
			console.log(
				`    SKIP image (wrangler upload failed): ${sourceUrl.slice(0, 80)}`,
			);
		}
	}

	return uploaded;
}

// --- Scrape Amazon ---

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
		servingSize: { type: "string", description: "Serving size info" },
		servingsPerContainer: {
			type: "number",
			description: "Number of servings per container",
		},
		priceUsd: { type: "number", description: "Current buy-box price in USD" },
		priceText: { type: "string", description: "Visible product price text" },
		ingredients: {
			type: "array",
			items: { type: "string" },
			description: "List of ingredients with amounts",
		},
	},
	required: ["title"],
};

const PLACEHOLDER_TITLES = new Set([
	"",
	"product title",
	"example product title",
	"product name",
	"example product name",
	"title",
	"n/a",
	"not available",
	"unknown",
]);

function isPlaceholderTitle(title: string): boolean {
	return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}

async function scrapeAmazonProduct(
	firecrawl: Firecrawl,
	url: string,
): Promise<ScrapeResult | null> {
	try {
		// First attempt: fast scrape (no JS rendering)
		let scrapeResponse = await firecrawl.scrape(url, {
			formats: [{ type: "json", schema: amazonProductSchema }, "html"],
		});

		let jsonData = (scrapeResponse.json as Record<string, unknown>) || {};
		let html = scrapeResponse.html || "";
		let title = ((jsonData.title as string) || "").trim();

		// If we got an empty/placeholder title, retry with headless browser
		// (Amazon serves bot-detection pages to some requests)
		if (isPlaceholderTitle(title) || html.length < 10000) {
			console.log("  Retrying with JS rendering (anti-bot page detected)...");
			const retryResponse = await firecrawl.scrape(url, {
				formats: [{ type: "json", schema: amazonProductSchema }, "html"],
				actions: [
					{ type: "wait", milliseconds: 5000 },
					{ type: "scroll", direction: "down", amount: 1 },
				],
			});
			jsonData = (retryResponse.json as Record<string, unknown>) || {};
			html = retryResponse.html || "";
			title = ((jsonData.title as string) || "").trim();
		}

		if (isPlaceholderTitle(title)) {
			return null;
		}

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

		const brand = (jsonData.brand as string) || null;
		const description = (jsonData.description as string) || null;

		return {
			title,
			brand: isPlaceholderTitle(brand ?? "") ? null : brand,
			description: isPlaceholderTitle(description ?? "") ? null : description,
			features: (jsonData.features as string[]) || [],
			images,
			servingSize: (jsonData.servingSize as string) || null,
			servingsPerContainer: (jsonData.servingsPerContainer as number) || null,
			ingredients: (jsonData.ingredients as string[]) || [],
			priceUsd,
		};
	} catch (err) {
		console.warn("  Scrape failed:", err instanceof Error ? err.message : err);
		return null;
	}
}

// --- Slug generation ---

function generateCleanSlug(
	productName: string,
	brandName: string | null,
	amount: string,
	potency: string,
): string {
	const fullName = `${brandName || ""} ${productName} ${potency} ${amount}`;
	return fullName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// --- Parse product-stock.md ---

function parseStockMarkdown(content: string): StockItem[] {
	const items: StockItem[] = [];
	const lines = content.split("\n");

	for (const line of lines) {
		// Match table rows: | # | Link | Stock | Price |
		const match = line.match(
			/\|\s*(\d+)\s*\|\s*(https?:\/\/[^\s|]+)\s*\|\s*(-?\d+)\s*\|\s*([\d,]+)\s*\|/,
		);
		if (!match) continue;

		const index = Number.parseInt(match[1] ?? "0", 10);
		const amazonUrl = (match[2] ?? "").trim();
		const stock = Number.parseInt(match[3] ?? "0", 10);
		const price = Number.parseInt((match[4] ?? "0").replace(/,/g, ""), 10);

		items.push({ index, amazonUrl, stock, price });
	}

	return items;
}

// --- Main ---

async function main() {
	if (!process.env.FIRECRAWL_API_KEY)
		throw new Error("FIRECRAWL_API_KEY missing");
	if (!process.env.OPENCODE_GO_API_KEY)
		throw new Error("OPENCODE_GO_API_KEY missing");

	const inputFile = process.argv.find((a, i) => i > 0 && !a.startsWith("--")) || "product-stock.md";
const mdContent = await readFile(inputFile, "utf-8");
	const items = parseStockMarkdown(mdContent);
	if (items.length === 0) {
		console.error("No products found in product-stock.md");
		process.exit(1);
	}

	console.log(`Parsed ${items.length} products from product-stock.md`);
	if (DRY_RUN)
		console.log("DRY RUN — re-run with --apply to create products\n");

	await mkdir(OUT_DIR, { recursive: true });

	const sql = postgres(
		`postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`,
	);

	const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

	// Pre-fetch brands and categories for AI matching
	const [brands, categories] = await Promise.all([
		sql<
			{ id: number; name: string }[]
		>`select id, name from ecom_vit_brand where deleted_at is null`,
		sql<
			{ id: number; name: string }[]
		>`select id, name from ecom_vit_category where deleted_at is null`,
	]);

	const results: ProductResult[] = [];

	for (const item of items) {
		console.log(`\n[${item.index}/${items.length}] ${item.amazonUrl}`);
		console.log(
			`  Stock: ${item.stock}, Price: ${item.price.toLocaleString()} MNT`,
		);

		try {
			// Step 1: Scrape Amazon
			console.log("  [1/6] Scraping Amazon...");
			const scraped = await scrapeAmazonProduct(firecrawl, item.amazonUrl);
			if (!scraped?.title) {
				throw new Error("Failed to scrape product page — no title");
			}
			console.log(`  Title: ${scraped.title}`);
			console.log(`  Brand: ${scraped.brand ?? "Unknown"}`);
			console.log(
				`  Images: ${scraped.images.length}, Ingredients: ${scraped.ingredients.length}`,
			);

			// Step 2: Filter images with AI
			console.log("  [2/6] Filtering images...");
			const filteredImages = await filterProductImages(
				scraped.title,
				scraped.images,
			);
			console.log(
				`  Filtered: ${scraped.images.length} → ${filteredImages.length} images`,
			);

			// Step 3: Vision analysis
			console.log("  [3/6] Analyzing images with vision AI...");
			const vision = await analyzeProductImages(filteredImages);
			console.log(
				`  Vision ingredients: ${vision.ingredients.length}, serving: ${vision.servingSize ?? "N/A"}`,
			);

			// Step 4: Translate + structure
			console.log("  [4/6] Translating to Mongolian...");
			const structured = await translateAndStructureProduct(
				scraped,
				vision,
				brands,
				categories,
			);
			if (!structured) {
				console.warn("  WARNING: Translation returned null, using raw data");
			}

			// Step 5: Upload images to R2
			let uploadedImages: { url: string }[] = [];
			if (APPLY && filteredImages.length > 0) {
				console.log("  [5/6] Uploading images to R2...");
				uploadedImages = await uploadImagesToR2(filteredImages);
				console.log(
					`  Uploaded: ${uploadedImages.length}/${filteredImages.length} images`,
				);
			} else {
				console.log("  [5/6] Skipping image upload (dry run)");
			}

			// Step 6: Create product in DB
			const finalBrandId =
				structured?.brandId != null &&
				brands.some((b) => b.id === structured.brandId)
					? structured.brandId
					: await resolveOrCreateBrandId(sql, scraped.brand, brands);

			const GENERAL_SUPPLEMENTS_CATEGORY_ID = 496; // "Ерөнхий Витамин ба Нэмэлт"

			const finalCategoryId =
				structured?.categoryId != null &&
				categories.some((c) => c.id === structured.categoryId)
					? structured.categoryId
					: GENERAL_SUPPLEMENTS_CATEGORY_ID;

			const productName = structured?.name || scraped.title;
			const amount = structured?.amount || "Unknown";
			const potency = structured?.potency || "Unknown";
			const slug = generateCleanSlug(
				productName,
				scraped.brand,
				amount,
				potency,
			);

			// Check for duplicate
			const existing = await sql<{ id: number }[]>`
				select id from ecom_vit_product where slug = ${slug} and deleted_at is null
			`;
			const isDuplicate = existing.length > 0;
			if (isDuplicate) {
				console.log(
					`  DUPLICATE FLAG — slug "${slug}" already exists (id: ${existing[0]?.id ?? "?"})`,
				);
			}

			if (APPLY) {
				console.log("  [6/6] Creating product in DB...");
				const fullName = `${scraped.brand ? `${scraped.brand} ` : ""}${productName} ${potency} ${amount}`;

				const inserted = await sql<{ id: number }[]>`
					insert into ecom_vit_product (
						name, slug, description, status, discount, amount, potency,
						stock, price, daily_intake, category_id, brand_id,
						tags, is_featured, ingredients,
						seo_title, seo_description, name_mn, weight_grams,
						created_at
					) values (
						${fullName},
						${slug},
						${structured?.description || scraped.description || fullName},
						'active',
						0,
						${amount},
						${potency},
						${item.stock},
						${item.price},
						${Math.round(structured?.dailyIntake || vision.dailyIntake || 1)},
						${finalCategoryId},
						${finalBrandId ?? 1},
						'[]'::jsonb,
						false,
						${JSON.stringify(structured?.ingredients || vision.ingredients || [])}::jsonb,
						${structured?.seoTitle || scraped.title.slice(0, 256)},
						${structured?.seoDescription || (scraped.description || "").slice(0, 512)},
						${structured?.name_mn || null},
						${Math.round(structured?.weightGrams || 200)},
						now()
					)
					returning id
				`;

				const productId = inserted[0]?.id;
				if (!productId) throw new Error("Failed to insert product — no id returned");
				console.log(`  Created product id=${productId} slug="${slug}"`);

				// Insert images
				if (uploadedImages.length > 0) {
					for (let i = 0; i < uploadedImages.length; i++) {
						const img = uploadedImages[i];
						if (!img) continue;
						await sql`
							insert into ecom_vit_product_image (product_id, url, is_primary, created_at)
							values (${productId}, ${img.url}, ${i === 0}, now())
						`;
					}
					console.log(`  Inserted ${uploadedImages.length} product images`);
				}

				results.push({
					index: item.index,
					amazonUrl: item.amazonUrl,
					status: isDuplicate ? "duplicate_flag" : "created",
					productId,
					slug,
				});
			} else {
				console.log("  [6/6] Skipping DB insert (dry run)");
				results.push({
					index: item.index,
					amazonUrl: item.amazonUrl,
					status: isDuplicate ? "duplicate_flag" : "created",
					slug,
				});
			}
		} catch (err) {
			console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
			results.push({
				index: item.index,
				amazonUrl: item.amazonUrl,
				status: "failed",
				error: err instanceof Error ? err.message : "unknown error",
			});
		}
	}

	// Write report
	await writeFile(REPORT_PATH, JSON.stringify(results, null, 2));
	await sql.end();

	// Summary
	const created = results.filter((r) => r.status === "created").length;
	const duplicates = results.filter(
		(r) => r.status === "duplicate_flag",
	).length;
	const failed = results.filter((r) => r.status === "failed").length;

	console.log(`\n${"=".repeat(60)}`);
	console.log(
		`SUMMARY: ${created} created, ${duplicates} duplicates, ${failed} failed`,
	);
	console.log(`Report: ${REPORT_PATH}`);
	console.log(
		APPLY
			? "Applied changes."
			: "Dry run only. Re-run with --apply to create products.",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
