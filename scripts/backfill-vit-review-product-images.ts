import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Firecrawl from "@mendable/firecrawl-js";
import { config } from "dotenv";
import postgres from "postgres";
import stringSimilarity from "string-similarity";
import { addedProducts } from "../apps/admin/src/features/products/vit-review-data";

config({ path: ".env" });

type Product = (typeof addedProducts)[number];

type ScrapedProduct = {
	title: string;
	brand: string | null;
	images: string[];
	url: string;
};

type Result =
	| {
			status: "uploaded";
			productId: number;
			name: string;
			amazonUrl: string;
			title: string;
			score: number;
			imageCount: number;
			urls: string[];
	  }
	| {
			status: "skipped" | "failed";
			productId: number;
			name: string;
			reason: string;
	  };

const APPLY = process.argv.includes("--apply");
const LIMIT = readNumberArg("--limit");
const ONLY_ID = readNumberArg("--product-id");
const CONCURRENCY = readNumberArg("--concurrency") ?? 2;
const BUCKET = process.env.R2_BUCKET_NAME ?? "vit-store-bucket-prod";
const CDN_BASE_URL = process.env.CDN_BASE_URL ?? "https://cdn.darjs.dev";
const OUT_DIR = resolve(
	"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/product-image-backfill",
);
const TMP_DIR = resolve("tmp/vit-review-product-images");
const amazonProductSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		brand: { type: "string" },
		images: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: ["title"],
};

if (!process.env.FIRECRAWL_API_KEY) {
	throw new Error("FIRECRAWL_API_KEY is missing in .env");
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(TMP_DIR, { recursive: true });

const sql = postgres(getDbUrl(), {
	ssl: "require",
	max: 2,
	fetch_types: false,
});
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

const input = addedProducts
	.filter((product) => (ONLY_ID ? product.id === ONLY_ID : true))
	.slice(0, LIMIT ?? addedProducts.length);

const existingImageRows = await sql<{ productId: number }[]>`
	select distinct product_id as "productId"
	from ecom_vit_product_image
	where deleted_at is null
		and product_id in ${sql(input.map((product) => product.id))}
`;
const alreadyHasImage = new Set(existingImageRows.map((row) => row.productId));

const results: Result[] = [];
const queue = [...input];

await Promise.all(
	Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, async () => {
		for (;;) {
			const product = queue.shift();
			if (!product) return;
			const result = await backfillProduct(product);
			results.push(result);
			console.log(
				`${result.status.toUpperCase()} #${result.productId} ${result.name}`,
				"reason" in result ? result.reason : `${result.imageCount} images`,
			);
		}
	}),
);

const summary = {
	generatedAt: new Date().toISOString(),
	apply: APPLY,
	total: input.length,
	uploaded: results.filter((result) => result.status === "uploaded").length,
	skipped: results.filter((result) => result.status === "skipped").length,
	failed: results.filter((result) => result.status === "failed").length,
	results,
};
const reportPath = join(
	OUT_DIR,
	`product-image-backfill.${new Date().toISOString().replaceAll(":", "-")}.json`,
);
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
	JSON.stringify({ ...summary, results: undefined, reportPath }, null, 2),
);

await sql.end();

async function backfillProduct(product: Product): Promise<Result> {
	if (alreadyHasImage.has(product.id)) {
		return {
			status: "skipped",
			productId: product.id,
			name: product.name,
			reason: "Product already has active image rows.",
		};
	}

	try {
		const scraped = await findAndScrapeProduct(product);
		if (!scraped) {
			return {
				status: "failed",
				productId: product.id,
				name: product.name,
				reason: "No Amazon product page with usable images found.",
			};
		}

		const score = matchScore(product, scraped);
		if (score < 0.42) {
			return {
				status: "skipped",
				productId: product.id,
				name: product.name,
				reason: `Low title/brand match (${score.toFixed(3)}) for "${scraped.title}".`,
			};
		}

		const images = filterImageUrls(scraped.images).slice(0, 4);
		if (images.length === 0) {
			return {
				status: "failed",
				productId: product.id,
				name: product.name,
				reason: "Scraped page had no usable product image URLs.",
			};
		}

		if (!APPLY) {
			return {
				status: "skipped",
				productId: product.id,
				name: product.name,
				reason: `Dry run matched "${scraped.title}" with ${images.length} images.`,
			};
		}

		const uploaded = await uploadImagesToR2(images);
		if (uploaded.length === 0) {
			return {
				status: "failed",
				productId: product.id,
				name: product.name,
				reason: "All R2 uploads failed.",
			};
		}

		await sql.begin(async (tx) => {
			const existing = await tx<{ id: number }[]>`
				select id from ecom_vit_product_image
				where product_id = ${product.id}
					and deleted_at is null
				limit 1
			`;
			if (existing.length > 0) return;

			for (let index = 0; index < uploaded.length; index++) {
				const url = uploaded[index];
				if (!url) continue;
				await tx`
					insert into ecom_vit_product_image (product_id, url, is_primary, created_at)
					values (${product.id}, ${url}, ${index === 0}, now())
				`;
			}
		});

		return {
			status: "uploaded",
			productId: product.id,
			name: product.name,
			amazonUrl: scraped.url,
			title: scraped.title,
			score,
			imageCount: uploaded.length,
			urls: uploaded,
		};
	} catch (error) {
		return {
			status: "failed",
			productId: product.id,
			name: product.name,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

async function findAndScrapeProduct(
	product: Product,
): Promise<ScrapedProduct | null> {
	const query = [
		product.brandName,
		product.name,
		product.amount,
		product.potency,
	]
		.filter((part) => !!part && part !== "N/A")
		.join(" ");
	const searchResponse = await firecrawl.search(`site:amazon.com ${query}`, {
		limit: 5,
	});
	const urls =
		searchResponse.web
			?.map((result) => ("url" in result ? result.url : null))
			.filter((url): url is string => !!url && url.includes("amazon.com"))
			.filter((url) => url.includes("/dp/") || url.includes("/gp/product/")) ??
		[];

	for (const url of urls.slice(0, 3)) {
		const scraped = await scrapeAmazonProduct(url);
		if (scraped?.images.length) return scraped;
	}

	return null;
}

async function scrapeAmazonProduct(
	url: string,
): Promise<ScrapedProduct | null> {
	const response = await firecrawl.scrape(url, {
		formats: [{ type: "json", schema: amazonProductSchema }, "html"],
	});
	const jsonData = (response.json as Record<string, unknown>) || {};
	const html = response.html || "";
	const title = String(jsonData.title || "").trim();
	const brand =
		typeof jsonData.brand === "string" && jsonData.brand.trim()
			? jsonData.brand.trim()
			: null;
	const images = [
		...extractProductImageIds(html).map(toHighResUrl),
		...(Array.isArray(jsonData.images) ? jsonData.images : []),
	].filter((image): image is string => typeof image === "string");

	if (!title || images.length === 0) return null;
	return { title, brand, images, url };
}

async function uploadImagesToR2(imageUrls: string[]): Promise<string[]> {
	const uploaded: string[] = [];

	for (const sourceUrl of imageUrls) {
		const img = await downloadImage(sourceUrl);
		if (!img) continue;

		const ext = extFromContentType(img.contentType);
		const id = randomUUID().replace(/-/g, "");
		const key = `products/catalog/${id}.${ext}`;
		const localPath = join(TMP_DIR, `${id}.${ext}`);
		await writeFile(localPath, img.bytes);

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
				img.contentType,
				"--remote",
			],
			{ encoding: "utf8" },
		);

		if (result.status === 0) {
			uploaded.push(`${CDN_BASE_URL}/${key}`);
		}
	}

	return uploaded;
}

async function downloadImage(
	url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				Accept: "image/*",
			},
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) return null;
		const contentType = response.headers.get("content-type") || "";
		if (!contentType.startsWith("image/")) return null;
		return {
			bytes: new Uint8Array(await response.arrayBuffer()),
			contentType,
		};
	} catch {
		return null;
	}
}

function matchScore(product: Product, scraped: ScrapedProduct): number {
	const expected = normalize(`${product.brandName} ${product.name}`);
	const actual = normalize(`${scraped.brand ?? ""} ${scraped.title}`);
	const nameScore = stringSimilarity.compareTwoStrings(expected, actual);
	const brandScore = scraped.brand
		? stringSimilarity.compareTwoStrings(
				normalize(product.brandName),
				normalize(scraped.brand),
			)
		: 0.5;
	return nameScore * 0.75 + brandScore * 0.25;
}

function filterImageUrls(urls: string[]): string[] {
	const seen = new Set<string>();
	const filtered: string[] = [];
	for (const url of urls) {
		const normalized = normalizeImageUrl(url);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		if (/sprite|icon|favicon|logo|thumbnail/i.test(url)) continue;
		filtered.push(url);
	}
	return filtered;
}

function extractProductImageIds(html: string): string[] {
	const imageIds = new Set<string>();
	const colorImagesMatch = html.match(
		/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/,
	);
	if (colorImagesMatch) {
		try {
			const imagesData = JSON.parse(colorImagesMatch[1] ?? "[]") as Array<{
				hiRes?: string;
				large?: string;
				main?: Record<string, string>;
			}>;
			for (const image of imagesData) {
				const url =
					image.hiRes || image.large || Object.values(image.main || {})[0];
				const id = imageIdFromUrl(url);
				if (id) imageIds.add(id);
			}
		} catch {}
	}

	for (const match of html.matchAll(/data-old-hires="([^"]+)"/g)) {
		const id = imageIdFromUrl(match[1]);
		if (id) imageIds.add(id);
	}
	for (const match of html.matchAll(
		/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g,
	)) {
		const id = match[1];
		if (id) imageIds.add(id);
	}

	return Array.from(imageIds).slice(0, 10);
}

function imageIdFromUrl(url: string | undefined): string | null {
	const match = url?.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
	return match?.[1] ?? null;
}

function toHighResUrl(imageId: string): string {
	return `https://m.media-amazon.com/images/I/${imageId}._AC_SL1500_.jpg`;
}

function normalizeImageUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`.toLowerCase();
	} catch {
		return null;
	}
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(vegan|vegetarian|capsules?|tablets?|softgels?|gummies|mg|mcg|iu|fl|oz|pack)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function extFromContentType(contentType: string): string {
	if (contentType.includes("png")) return "png";
	if (contentType.includes("gif")) return "gif";
	if (contentType.includes("webp")) return "webp";
	return "jpg";
}

function getDbUrl(): string {
	if (process.env.DIRECT_DB_URL) return process.env.DIRECT_DB_URL;
	if (
		process.env.PLANETSCALE_USER &&
		process.env.PLANETSCALE_PASSWORD &&
		process.env.PLANETSCALE_HOST &&
		process.env.PLANETSCALE_DATABASE
	) {
		return `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
	}
	throw new Error("Missing DIRECT_DB_URL or PLANETSCALE_* variables.");
}

function readNumberArg(name: string): number | null {
	const index = process.argv.indexOf(name);
	if (index === -1) return null;
	const value = Number.parseInt(process.argv[index + 1] ?? "", 10);
	return Number.isFinite(value) ? value : null;
}
