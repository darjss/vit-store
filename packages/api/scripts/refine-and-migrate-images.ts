import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

type ProductImage = { url: string; isPrimary?: boolean };
type Product = {
	sourceId: number;
	name: string;
	slug: string;
	brand: string;
	images: ProductImage[];
	[key: string]: unknown;
};
type ProductFile = {
	generatedAt: string;
	count: number;
	products: Product[];
};

const selectionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(8),
	primaryIndex: z.number().int().min(0).nullable(),
});

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
	const k = process.argv[i];
	const v = process.argv[i + 1] ?? "";
	if (k?.startsWith("--")) args.set(k, v);
}

const backendUrl =
	args.get("--backend-url")?.trim() || "https://api.amerikvitamin.mn";
const prefix = args.get("--prefix")?.trim() || "products/catalog-v2";
const concurrency = Number.parseInt(args.get("--concurrency") ?? "8", 10);
const useGemini = (args.get("--gemini") ?? "true") !== "false";

const isAmazonUrl = (url: string): boolean =>
	url.includes("m.media-amazon.com") || url.includes("amazon.com/images/");

const normalizedKey = (url: string): string => {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/$/, "");
	} catch {
		return url.toLowerCase().split("?")[0] ?? url.toLowerCase();
	}
};

const isLikelyBadImage = (url: string): boolean => {
	const u = url.toLowerCase();
	if (u.includes("51np-5gx4jl")) return true;
	if (u.includes("sprite") || u.includes("icon") || u.includes("thumbnail")) {
		return true;
	}
	if (u.includes("hero") || u.includes("banner") || u.includes("logo")) {
		return true;
	}
	return false;
};

const unique = (arr: string[]): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const url of arr) {
		const k = normalizedKey(url);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(url);
	}
	return out;
};

async function geminiSelect(
	productName: string,
	candidates: string[],
): Promise<{ keep: string[]; primary: string | null; usedFallback: boolean }> {
	if (candidates.length <= 1 || !useGemini) {
		return {
			keep: candidates.slice(0, 8),
			primary: candidates[0] ?? null,
			usedFallback: false,
		};
	}

	try {
		const { output } = await generateText({
			model: google("gemini-2.5-flash"),
			output: Output.object({ schema: selectionSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Choose the best images for product: ${productName}.
Keep only images clearly showing THIS exact product package/label/supplement facts.
Remove unrelated products, generic promo images, duplicate angles, and noisy collages.
Return keepIndices (max 8) and primaryIndex from provided order.`,
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
		const keep = (keepIndices.length ? keepIndices : [0])
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

async function uploadUrls(
	urls: string[],
	productSlug: string,
): Promise<string[]> {
	if (urls.length === 0) return [];
	const safeSlug = productSlug
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
	const p = `${prefix}/${safeSlug || "item"}`;
	const res = await fetch(
		`${backendUrl}/upload/images/urls?prefix=${encodeURIComponent(p)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(urls.map((url) => ({ url }))),
		},
	);
	if (!res.ok) return urls;
	const payload = (await res.json()) as { images?: Array<{ url: string }> };
	const mapped = payload.images?.map((x) => x.url) ?? [];
	if (mapped.length !== urls.length) return urls;
	return mapped;
}

async function main() {
	const raw = JSON.parse(readFileSync("products.json", "utf-8")) as ProductFile;
	const products = raw.products;

	let geminiRuns = 0;
	let geminiFallbacks = 0;
	let amazonBefore = 0;
	let amazonAfter = 0;
	let uploadedCount = 0;
	let badRemoved = 0;

	let index = 0;
	const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
		while (true) {
			const i = index;
			index += 1;
			if (i >= products.length) return;
			const p = products[i]!;

			const original = Array.isArray(p.images) ? p.images : [];
			const originalUrls = original.map((x) => x.url).filter(Boolean);
			if (originalUrls.some(isAmazonUrl)) amazonBefore += 1;

			const pre = unique(originalUrls);
			const cleaned = pre.filter((url, idx) => {
				if (!isLikelyBadImage(url)) return true;
				if (pre.length === 1 && idx === 0) return true;
				badRemoved += 1;
				return false;
			});

			let selected = cleaned;
			let primary: string | null = cleaned[0] ?? null;
			if (cleaned.length > 1 && useGemini) {
				geminiRuns += 1;
				const out = await geminiSelect(p.name, cleaned);
				selected = unique(out.keep).slice(0, 8);
				primary = out.primary;
				if (out.usedFallback) geminiFallbacks += 1;
			}

			if (selected.length === 0 && cleaned.length > 0) selected = [cleaned[0]!];
			if (selected.length === 0) {
				p.images = [];
				continue;
			}

			const amazonUrls = selected.filter(isAmazonUrl);
			if (amazonUrls.length > 0) {
				const uploaded = await uploadUrls(amazonUrls, p.slug);
				uploadedCount += uploaded.filter(
					(u, idx2) => u !== amazonUrls[idx2],
				).length;
				const map = new Map<string, string>();
				for (let z = 0; z < amazonUrls.length; z++) {
					map.set(amazonUrls[z]!, uploaded[z] ?? amazonUrls[z]!);
				}
				selected = selected.map((url) => map.get(url) ?? url);
				if (primary && map.has(primary)) primary = map.get(primary) ?? primary;
			}

			const normalizedPrimary = primary ? normalizedKey(primary) : null;
			const primaryIndex = normalizedPrimary
				? selected.findIndex((u) => normalizedKey(u) === normalizedPrimary)
				: 0;
			if (primaryIndex > 0) {
				const [head] = selected.splice(primaryIndex, 1);
				selected.unshift(head!);
			}

			p.images = selected.map((url, k) => ({ url, isPrimary: k === 0 }));
			if (selected.some(isAmazonUrl)) amazonAfter += 1;
		}
	});

	await Promise.all(workers);

	raw.generatedAt = new Date().toISOString();
	raw.count = raw.products.length;
	writeFileSync("products.json", `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

	mkdirSync("generated", { recursive: true });
	writeFileSync(
		"generated/image-refine-report.json",
		`${JSON.stringify(
			{
				runAt: new Date().toISOString(),
				products: raw.products.length,
				geminiEnabled: useGemini,
				geminiRuns,
				geminiFallbacks,
				badRemoved,
				amazonProductsBefore: amazonBefore,
				amazonProductsAfter: amazonAfter,
				uploadedOrRewrittenUrls: uploadedCount,
				backendUrl,
				prefix,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	console.log(
		JSON.stringify(
			{
				products: raw.products.length,
				geminiRuns,
				geminiFallbacks,
				badRemoved,
				amazonProductsBefore: amazonBefore,
				amazonProductsAfter: amazonAfter,
				uploadedOrRewrittenUrls: uploadedCount,
			},
			null,
			2,
		),
	);
}

main();
