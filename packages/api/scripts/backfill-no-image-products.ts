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

const schema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(6),
	primaryIndex: z.number().int().min(0).nullable(),
});

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
	return Array.from(imageIds).slice(0, 16);
}

function uniq(urls: string[]): string[] {
	const s = new Set<string>();
	const out: string[] = [];
	for (const u of urls) {
		const k = u.toLowerCase().split("?")[0];
		if (s.has(k)) continue;
		s.add(k);
		out.push(u);
	}
	return out;
}

async function pick(name: string, urls: string[]): Promise<string[]> {
	const c = uniq(urls).slice(0, 12);
	if (c.length <= 3) return c;
	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Pick best product gallery for ${name}. Keep clear front image first, plus alternate and label views. Remove unrelated or noisy images. Keep up to 6.`,
						},
						...c.map((image) => ({ type: "image" as const, image })),
					],
				},
			],
		});
		const idx = Array.from(new Set(output.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < c.length,
		);
		const keep = (idx.length ? idx : [0, 1, 2].filter((i) => i < c.length)).map(
			(i) => c[i]!,
		);
		return uniq(keep).slice(0, 6);
	} catch {
		return c.slice(0, 5);
	}
}

async function main() {
	if (!process.env.FIRECRAWL_API_KEY)
		throw new Error("FIRECRAWL_API_KEY missing");
	const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
	const data = JSON.parse(readFileSync("products.json", "utf8")) as ProductFile;
	const noImg = data.products.filter((p) => (p.images ?? []).length === 0);

	const fixed: Array<{ sourceId: number; slug: string; count: number }> = [];
	const failed: Array<{ sourceId: number; slug: string; reason: string }> = [];

	for (const p of noImg) {
		try {
			const q = `${p.brand} ${p.name}`;
			const s = await fc.search(`site:amazon.com ${q}`, { limit: 6 });
			const url = (s.web ?? [])
				.map((r) => ("url" in r ? r.url : undefined))
				.find((u) => u && (u.includes("/dp/") || u.includes("/gp/product/")));
			if (!url) throw new Error("search no result");
			const sc = await fc.scrape(url, { formats: ["html"] });
			const ids = extractProductImageIds(sc.html || "");
			const candidates = ids.map(toHighResUrl);
			const chosen = await pick(p.name, candidates);
			const up = await fetch(
				`https://api.amerikvitamin.mn/upload/images/urls?prefix=${encodeURIComponent(`products/catalog-v3/${p.slug}`)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(chosen.map((url2) => ({ url: url2 }))),
				},
			);
			const body = (await up.json()) as { images?: Array<{ url: string }> };
			const out = (body.images ?? [])
				.map((x) => x.url)
				.filter((u) => u.includes("cdn.darjs.dev"));
			if (out.length === 0) throw new Error("upload failed");
			p.images = out
				.slice(0, 6)
				.map((url2, i) => ({ url: url2, isPrimary: i === 0 }));
			fixed.push({
				sourceId: p.sourceId,
				slug: p.slug,
				count: p.images.length,
			});
		} catch (e) {
			failed.push({
				sourceId: p.sourceId,
				slug: p.slug,
				reason: e instanceof Error ? e.message : "unknown",
			});
		}
	}

	data.generatedAt = new Date().toISOString();
	data.count = data.products.length;
	writeFileSync("products.json", `${JSON.stringify(data, null, 2)}\n`, "utf8");

	mkdirSync("generated", { recursive: true });
	writeFileSync(
		"generated/no-image-backfill-report.json",
		`${JSON.stringify({ runAt: new Date().toISOString(), fixed, failed }, null, 2)}\n`,
		"utf8",
	);

	console.log(
		JSON.stringify(
			{
				totalNoImage: noImg.length,
				fixed: fixed.length,
				failed: failed.length,
			},
			null,
			2,
		),
	);
}

main();
