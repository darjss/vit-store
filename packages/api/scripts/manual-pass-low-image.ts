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
	images: ProductImage[];
};
type ProductFile = { generatedAt: string; count: number; products: Product[] };

const pickSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(6),
	primaryIndex: z.number().int().min(0).nullable(),
});

const OVERWRITE_SOURCE_IDS = new Set([
	4098, 4412, 4397, 4390, 4350, 4352, 4342, 4343, 4337, 4313, 4211, 4196,
]);

const normalizeKey = (url: string): string => {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`.toLowerCase();
	} catch {
		return url.toLowerCase().split("?")[0] ?? url.toLowerCase();
	}
};

const unique = (urls: string[]): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const url of urls) {
		const key = normalizeKey(url);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(url);
	}
	return out;
};

const isGoodCdn = (url: string): boolean =>
	url.includes("cdn.darjs.dev") && !url.includes("m.media-amazon.com");

function toHighResUrl(imageId: string): string {
	const cleanId = imageId.replace(/\.[^.]+$/, "");
	return `https://m.media-amazon.com/images/I/${cleanId}._AC_SL1500_.jpg`;
}

function extractProductImageIds(html: string): string[] {
	const imageIds = new Set<string>();
	for (const m of html.matchAll(/data-old-hires="([^"]+)"/g)) {
		const idMatch = m[1]?.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]!);
	}
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
	for (const m of html.matchAll(/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g)) {
		if (m[1]) imageIds.add(m[1]);
	}
	return Array.from(imageIds).slice(0, 20);
}

function compactQuery(brand: string, name: string): string {
	const cleaned = `${brand} ${name}`
		.replace(/\bDietary Supplement\b/gi, "")
		.replace(/\b(With|Made With|For|And)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.slice(0, 140);
}

async function searchProductUrl(
	firecrawl: Firecrawl,
	query: string,
): Promise<string | null> {
	const tries = [
		`site:amazon.com ${query}`,
		`site:iherb.com ${query}`,
		`${query} product`,
	];
	for (const q of tries) {
		const res = await firecrawl.search(q, { limit: 6 });
		for (const r of res.web ?? []) {
			const url = "url" in r ? r.url : undefined;
			if (!url) continue;
			if (
				url.includes("/dp/") ||
				url.includes("/gp/product/") ||
				url.includes("iherb.com/pr/") ||
				url.includes("iherb.com/p/")
			) {
				return url;
			}
		}
		const first = res.web?.[0];
		if (first && "url" in first && first.url) return first.url;
	}
	return null;
}

async function pickImages(
	name: string,
	candidates: string[],
): Promise<string[]> {
	const pool = unique(candidates).slice(0, 12);
	if (pool.length <= 4) return pool;
	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema: pickSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Choose a balanced product image gallery for ${name}. Keep max 6 images. Prioritize: 1) clear front packshot, 2) alternate angle, 3) label/supplement facts, 4) lifestyle only if it still shows exact product. Remove unrelated products and duplicates.`,
						},
						...pool.map((image) => ({ type: "image" as const, image })),
					],
				},
			],
		});
		const keepIdx = Array.from(new Set(output.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < pool.length,
		);
		const keep = (keepIdx.length ? keepIdx : [0, 1, 2, 3])
			.map((i) => pool[i]!)
			.filter(Boolean);
		let out = unique(keep).slice(0, 6);
		const primary =
			output.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < pool.length
				? pool[output.primaryIndex]
				: out[0];
		if (primary) {
			const idx = out.findIndex(
				(u) => normalizeKey(u) === normalizeKey(primary),
			);
			if (idx > 0) {
				const [head] = out.splice(idx, 1);
				out.unshift(head!);
			}
		}
		if (out.length < 3) out = unique([...out, ...pool]).slice(0, 4);
		return out;
	} catch {
		return pool.slice(0, 5);
	}
}

async function upload(urls: string[], slug: string): Promise<string[]> {
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
	if (!res.ok) return [];
	const body = (await res.json()) as { images?: Array<{ url: string }> };
	return (body.images ?? []).map((x) => x.url).filter(isGoodCdn);
}

async function gatherCandidates(
	firecrawl: Firecrawl,
	query: string,
): Promise<string[]> {
	const url = await searchProductUrl(firecrawl, query);
	if (!url) return [];
	const scrape = await firecrawl.scrape(url, { formats: ["html"] });
	const html = scrape.html || "";
	if (url.includes("amazon.")) {
		return extractProductImageIds(html).map(toHighResUrl);
	}
	const direct = Array.from(
		html.matchAll(/https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi),
	).map((m) => m[0]);
	return unique(direct).slice(0, 20);
}

async function main() {
	if (!process.env.FIRECRAWL_API_KEY) {
		throw new Error("FIRECRAWL_API_KEY is required");
	}
	const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
	const data = JSON.parse(readFileSync("products.json", "utf8")) as ProductFile;
	const products = data.products;

	const targets = products.filter((p) => (p.images ?? []).length < 3);
	const fixed: Array<{
		sourceId: number;
		slug: string;
		before: number;
		after: number;
	}> = [];
	const failed: Array<{ sourceId: number; slug: string; reason: string }> = [];

	for (const p of targets) {
		const before = (p.images ?? []).length;
		try {
			const candidates = await gatherCandidates(
				firecrawl,
				compactQuery(p.brand, p.name),
			);
			if (candidates.length === 0) throw new Error("no candidates");
			const selected = await pickImages(p.name, candidates);
			const uploaded = await upload(selected, p.slug);
			if (uploaded.length === 0) throw new Error("upload returned empty");

			const existing = (p.images ?? []).map((i) => i.url).filter(isGoodCdn);
			const merged = OVERWRITE_SOURCE_IDS.has(p.sourceId)
				? unique(uploaded)
				: unique([...existing, ...uploaded]);
			const final = merged.slice(0, 6);
			if (final.length < 2) throw new Error("still <2 after merge");

			p.images = final.map((url, i) => ({ url, isPrimary: i === 0 }));
			fixed.push({
				sourceId: p.sourceId,
				slug: p.slug,
				before,
				after: p.images.length,
			});
		} catch (error) {
			failed.push({
				sourceId: p.sourceId,
				slug: p.slug,
				reason: error instanceof Error ? error.message : "unknown",
			});
		}
	}

	data.generatedAt = new Date().toISOString();
	data.count = data.products.length;
	writeFileSync("products.json", `${JSON.stringify(data, null, 2)}\n`, "utf8");

	mkdirSync("generated", { recursive: true });
	writeFileSync(
		"generated/manual-pass-low-image-report.json",
		`${JSON.stringify(
			{
				runAt: new Date().toISOString(),
				targets: targets.length,
				fixedCount: fixed.length,
				failedCount: failed.length,
				fixed,
				failed,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	console.log(
		JSON.stringify(
			{
				targets: targets.length,
				fixedCount: fixed.length,
				failedCount: failed.length,
			},
			null,
			2,
		),
	);
}

main();
