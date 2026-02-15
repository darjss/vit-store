import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "@ai-sdk/google";
import Firecrawl from "@mendable/firecrawl-js";
import { generateText, Output } from "ai";
import { z } from "zod";

type ProductImage = { url: string; isPrimary?: boolean };
type Product = {
	sourceId: number;
	name: string;
	slug: string;
	brand: string;
	amount: string;
	potency: string;
	description: string;
	ingredients?: string[];
	images: ProductImage[];
	[key: string]: unknown;
};

type ProductFile = { generatedAt: string; count: number; products: Product[] };

type FirecrawlExtractedProduct = {
	title: string;
	brand: string | null;
	description: string | null;
	features: string[];
	images: string[];
	servingSize: string | null;
	ingredients: string[];
};

const imagePickSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(6),
	primaryIndex: z.number().int().min(0).nullable(),
});

const amazonProductSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		brand: { type: "string" },
		description: { type: "string" },
		features: { type: "array", items: { type: "string" } },
		servingSize: { type: "string" },
		ingredients: { type: "array", items: { type: "string" } },
	},
	required: ["title"],
};

const TARGETS: Array<{ sourceId: number; query: string; forceBrand?: string }> =
	[
		{
			sourceId: 4098,
			query: "Calm kids magnesium citrate anti stress gummies 60 count 100 mg",
			forceBrand: "Calm",
		},
		{
			sourceId: 4412,
			query: "Nutricost vitamin c with zinc 1000 mg 45 mg 120 capsules",
		},
		{ sourceId: 4397, query: "Nutricost vitamin b complex 462mg 240 capsules" },
		{
			sourceId: 4390,
			query:
				"Micro Ingredients vitamin d3 k2 5000 iu 100 mcg mk-7 made with coconut oil 300 softgels",
		},
		{
			sourceId: 4350,
			query: "Heritage Store organic castor oil nourishing treatment 16 fl oz",
		},
		{
			sourceId: 4352,
			query:
				"Natural Factors DGL deglycyrrhizinated licorice 180 chewable tablets",
		},
		{
			sourceId: 4342,
			query:
				"Micro Ingredients black seed oil with vitamin d3 2000 mg 240 softgels",
		},
		{
			sourceId: 4343,
			query:
				"Micro Ingredients black seed oil 3000 mg with oil of oregano 240 softgels",
		},
		{
			sourceId: 4337,
			query: "California Gold Nutrition Bone Boost MBP 120 tablets",
		},
		{
			sourceId: 4313,
			query: "Physician's Choice 60 billion probiotic 60 capsules",
		},
		{ sourceId: 4211, query: "Nutricost Uva Ursi 4500mg 240 capsules" },
		{
			sourceId: 4196,
			query:
				"Micro Ingredients biotin 5000 mcg made with coconut oil 500 softgels",
		},
	];

const SKIP_HISTORY_RESTORE = new Set(TARGETS.map((t) => t.sourceId));
const DUPLICATE_REMOVE_IDS = new Set([4280, 4242, 4262]);

const normalizeUrl = (url: string): string => {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`.toLowerCase();
	} catch {
		return url.toLowerCase().split("?")[0] ?? url.toLowerCase();
	}
};

const uniqueUrls = (urls: string[]): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const u of urls) {
		const k = normalizeUrl(u);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(u);
	}
	return out;
};

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
				if (!url) continue;
				const idMatch = url.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
				if (idMatch) imageIds.add(idMatch[1]!);
			}
		} catch {}
	}
	for (const m of html.matchAll(/data-old-hires="([^"]+)"/g)) {
		const idMatch = m[1]?.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]!);
	}
	for (const m of html.matchAll(/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g)) {
		if (m[1]) imageIds.add(m[1]);
	}
	return Array.from(imageIds).slice(0, 16);
}

async function searchAmazonProduct(
	firecrawl: Firecrawl,
	query: string,
): Promise<string | null> {
	const res = await firecrawl.search(`site:amazon.com ${query}`, { limit: 6 });
	for (const r of res.web ?? []) {
		const u = "url" in r ? r.url : undefined;
		if (u && (u.includes("/dp/") || u.includes("/gp/product/"))) return u;
	}
	const first = res.web?.[0];
	return first && "url" in first ? (first.url ?? null) : null;
}

async function scrapeAmazonProduct(
	firecrawl: Firecrawl,
	url: string,
): Promise<FirecrawlExtractedProduct | null> {
	const scrape = await firecrawl.scrape(url, {
		formats: [{ type: "json", schema: amazonProductSchema }, "html"],
	});
	const jsonData = (scrape.json as Record<string, unknown>) || {};
	const html = scrape.html || "";
	const imageIds = extractProductImageIds(html);
	const images = imageIds.map(toHighResUrl);
	return {
		title: (jsonData.title as string) || "",
		brand: (jsonData.brand as string) || null,
		description: (jsonData.description as string) || null,
		features: (jsonData.features as string[]) || [],
		images,
		servingSize: (jsonData.servingSize as string) || null,
		ingredients: (jsonData.ingredients as string[]) || [],
	};
}

async function pickImages(
	productName: string,
	urls: string[],
): Promise<string[]> {
	const candidates = uniqueUrls(urls).slice(0, 12);
	if (candidates.length <= 3) return candidates;
	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema: imagePickSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Pick strong product gallery images for ${productName}.
Keep front product image first, then back label/supplement facts, then alternate angles.
Do NOT keep only supplement facts; keep a balanced gallery. Remove unrelated products and duplicates.
Return keepIndices max 6, and primaryIndex for main hero image.`,
						},
						...candidates.map((image) => ({ type: "image" as const, image })),
					],
				},
			],
		});
		const idx = Array.from(new Set(output.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < candidates.length,
		);
		let keep = (
			idx.length ? idx : [0, 1, 2].filter((i) => i < candidates.length)
		).map((i) => candidates[i]!);
		keep = uniqueUrls(keep).slice(0, 6);
		const primary =
			output.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < candidates.length
				? candidates[output.primaryIndex]
				: keep[0];
		if (primary) {
			const ix = keep.findIndex(
				(u) => normalizeUrl(u) === normalizeUrl(primary),
			);
			if (ix > 0) {
				const [x] = keep.splice(ix, 1);
				keep.unshift(x!);
			}
		}
		if (keep.length < 3 && candidates.length >= 3) {
			const grow = uniqueUrls([...keep, ...candidates]).slice(0, 4);
			return grow;
		}
		return keep;
	} catch {
		return candidates.slice(0, 5);
	}
}

async function uploadImages(urls: string[], slug: string): Promise<string[]> {
	if (urls.length === 0) return [];
	const prefix = `products/catalog-v3/${slug}`;
	const res = await fetch(
		`https://api.amerikvitamin.mn/upload/images/urls?prefix=${encodeURIComponent(prefix)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(urls.map((url) => ({ url }))),
		},
	);
	if (!res.ok) return urls;
	const body = (await res.json()) as { images?: Array<{ url: string }> };
	const out = body.images?.map((x) => x.url) ?? [];
	if (out.length !== urls.length) return urls;
	return out;
}

function assignImages(product: Product, urls: string[]) {
	const clean = uniqueUrls(urls).slice(0, 8);
	product.images = clean.map((url, i) => ({ url, isPrimary: i === 0 }));
}

async function main() {
	const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
	if (!firecrawlApiKey) throw new Error("FIRECRAWL_API_KEY is required");

	const raw = JSON.parse(readFileSync("products.json", "utf-8")) as ProductFile;
	const products = raw.products;

	// Restore better galleries from known-good snapshot before strict pruning.
	const oldRaw = execSync("git show b10700f:products.json", {
		encoding: "utf8",
		maxBuffer: 100 * 1024 * 1024,
	});
	const oldProducts = (JSON.parse(oldRaw) as ProductFile).products;
	const oldBySourceId = new Map<number, Product>();
	for (const p of oldProducts) oldBySourceId.set(p.sourceId, p);

	let restoredFromHistory = 0;
	for (const p of products) {
		if (SKIP_HISTORY_RESTORE.has(p.sourceId)) continue;
		const old = oldBySourceId.get(p.sourceId);
		if (!old) continue;
		const curCount = Array.isArray(p.images) ? p.images.length : 0;
		const oldCount = Array.isArray(old.images) ? old.images.length : 0;
		if (oldCount <= curCount || oldCount < 3) continue;
		const oldUrls = (old.images ?? []).map((i) => i.url);
		if (!oldUrls.every((u) => u.includes("cdn.darjs.dev"))) continue;
		assignImages(p, oldUrls);
		restoredFromHistory += 1;
	}

	const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
	const repaired: Array<{
		sourceId: number;
		slug: string;
		before: number;
		after: number;
	}> = [];
	const failed: Array<{ sourceId: number; slug: string; reason: string }> = [];

	for (const t of TARGETS) {
		const p = products.find((x) => x.sourceId === t.sourceId);
		if (!p) {
			failed.push({
				sourceId: t.sourceId,
				slug: "missing",
				reason: "not found",
			});
			continue;
		}
		const before = p.images?.length ?? 0;
		try {
			const url = await searchAmazonProduct(firecrawl, t.query);
			if (!url) throw new Error("search no result");
			const scraped = await scrapeAmazonProduct(firecrawl, url);
			if (!scraped || !scraped.title) throw new Error("scrape failed");

			const picked = await pickImages(scraped.title || p.name, scraped.images);
			const uploaded = await uploadImages(picked, p.slug);
			assignImages(p, uploaded);

			if (scraped.brand?.trim()) p.brand = t.forceBrand ?? scraped.brand.trim();
			if (t.forceBrand) p.brand = t.forceBrand;
			if (scraped.description && scraped.description.trim().length > 24) {
				p.description = scraped.description.trim();
			}
			if (
				Array.isArray(scraped.ingredients) &&
				scraped.ingredients.length > 0
			) {
				p.ingredients = scraped.ingredients.slice(0, 20);
			}
			if (scraped.servingSize?.trim()) {
				p.amount = scraped.servingSize.trim();
			}

			repaired.push({
				sourceId: p.sourceId,
				slug: p.slug,
				before,
				after: p.images.length,
			});
		} catch (err) {
			failed.push({
				sourceId: p.sourceId,
				slug: p.slug,
				reason: err instanceof Error ? err.message : "unknown",
			});
		}
	}

	const beforeDedup = products.length;
	raw.products = products.filter((p) => !DUPLICATE_REMOVE_IDS.has(p.sourceId));
	raw.count = raw.products.length;
	raw.generatedAt = new Date().toISOString();
	writeFileSync("products.json", `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

	mkdirSync("generated", { recursive: true });
	writeFileSync(
		"generated/repair-product-images-report.json",
		`${JSON.stringify(
			{
				runAt: new Date().toISOString(),
				restoredFromHistory,
				repairedCount: repaired.length,
				failedCount: failed.length,
				repaired,
				failed,
				removedDuplicateSourceIds: Array.from(DUPLICATE_REMOVE_IDS),
				beforeDedup,
				afterDedup: raw.count,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	console.log(
		JSON.stringify(
			{
				restoredFromHistory,
				repairedCount: repaired.length,
				failedCount: failed.length,
				beforeDedup,
				afterDedup: raw.count,
			},
			null,
			2,
		),
	);
}

main();
