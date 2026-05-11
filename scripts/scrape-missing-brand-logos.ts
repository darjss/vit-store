import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import Firecrawl from "@mendable/firecrawl-js";
import { generateText, Output } from "ai";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import postgres from "postgres";
import { z } from "zod";

config({ path: ".env" });

const opencode = createOpenAICompatible({
	baseURL: "https://opencode.ai/zen/go/v1",
	apiKey: process.env.OPENCODE_GO_API_KEY,
	name: "opencode-go",
});

const APPLY = process.argv.includes("--apply");
const NO_GEMINI = process.argv.includes("--no-gemini");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "999");
const BUCKET = process.env.R2_BUCKET_NAME ?? "vit-store-bucket-prod";
const CDN_BASE_URL = process.env.CDN_BASE_URL ?? "https://cdn.darjs.dev";
const OUT_DIR = "tmp/brand-logos";
const PLACEHOLDER = "https://www.placeholder.com/logo.png";

type Brand = { id: number; name: string; logo_url: string };
type Candidate = { url: string; source: string; scoreHint: string };

function slugify(input: string) {
	return input
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/'/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function extFromContentType(contentType: string) {
	if (contentType.includes("svg")) return "svg";
	if (contentType.includes("png")) return "png";
	if (contentType.includes("webp")) return "webp";
	if (contentType.includes("gif")) return "gif";
	return "jpg";
}

function absolutize(url: string, baseUrl: string) {
	try { return new URL(url, baseUrl).toString(); } catch { return null; }
}

function looksLikeLogoUrl(url: string, brand: string) {
	const u = url.toLowerCase();
	const s = slugify(brand).replace(/-/g, "");
	if (!/^https?:\/\//.test(u)) return false;
	if (!/\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(u)) return false;
	if (u.includes("sprite") || u.includes("favicon") || u.includes("pixel") || u.includes("badge")) return false;
	if (u.includes("amazon") || u.includes("/products/") || u.includes("product")) return false;
	return u.includes("logo") || u.replace(/[^a-z0-9]/g, "").includes(s.slice(0, Math.min(10, s.length)));
}

function extractImageCandidates(html: string, pageUrl: string, brand: string): Candidate[] {
	const out: Candidate[] = [];
	const add = (raw: string | undefined, source: string, scoreHint: string) => {
		if (!raw) return;
		const abs = absolutize(raw.replace(/&amp;/g, "&"), pageUrl);
		if (abs && looksLikeLogoUrl(abs, brand)) out.push({ url: abs, source, scoreHint });
	};
	for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) add(m[1], pageUrl, "meta");
	for (const m of html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]*>/gi)) add(m[1], pageUrl, "img-logo-attr");
	for (const m of html.matchAll(/<img[^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)) add(m[1], pageUrl, "img-logo-attr");
	for (const m of html.matchAll(/(?:src|href)=["']([^"']*(?:logo|brand)[^"']*\.(?:png|jpe?g|webp|svg|gif)(?:\?[^"']*)?)["']/gi)) add(m[1], pageUrl, "asset-name");
	return out;
}

async function fetchValidImage(url: string) {
	const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*" }, signal: AbortSignal.timeout(15000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const contentType = res.headers.get("content-type") ?? "";
	if (!contentType.startsWith("image/")) throw new Error(`not image: ${contentType}`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength < 500) throw new Error(`too small: ${bytes.byteLength}`);
	return { bytes, contentType };
}

async function chooseCandidateWithGemini(brand: Brand, candidates: Candidate[]) {
	const unique = [...new Map(candidates.map((c) => [c.url, c])).values()].slice(0, 12);
	if (unique.length === 0) return null;
	const heuristicPick = () => {
		const brandToken = slugify(brand.name).replace(/-/g, "").slice(0, 8);
		const fallback = unique.find((c) => {
			const normalized = c.url.toLowerCase().replace(/[^a-z0-9]/g, "");
			return c.url.toLowerCase().includes("logo") && normalized.includes(brandToken);
		}) ?? unique.find((c) => c.url.toLowerCase().includes("logo"));
		return fallback ? { ...fallback, reason: "strict_url_heuristic" } : null;
	};
	if (NO_GEMINI) return heuristicPick();
	try {
		const { output } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({ schema: z.object({ index: z.number().int().min(-1), reason: z.string() }) }),
			messages: [{ role: "user", content: [
				{ type: "text", text: `Pick the best official BRAND LOGO for '${brand.name}'. Reject product photos, supplement bottles, ads, social preview photos, icons/favicons, and unrelated brands. Return index -1 if none are a real brand logo. Candidates are in order.` },
				...unique.map((c, i) => ({ type: "text" as const, text: `${i}: ${c.url} (${c.scoreHint})` })),
				// Gemini image parts do not reliably accept SVG, so inspect raster candidates visually
				// and use URL/name heuristics for SVG candidates.
				...unique
					.filter((c) => !/\.svg(?:\?|$)/i.test(c.url))
					.slice(0, 8)
					.map((c) => ({ type: "image" as const, image: c.url })),
			] }],
		});
		if (!output || output.index < 0 || output.index >= unique.length) return null;
		return { ...unique[output.index], reason: output.reason };
	} catch (error) {
		console.warn(`Gemini logo check failed for ${brand.name}; using strict URL heuristic fallback:`, error instanceof Error ? error.message : error);
		return heuristicPick();
	}
}

async function findLogo(firecrawl: Firecrawl, brand: Brand) {
	const queries = [
		`${brand.name} official logo supplement brand`,
		`${brand.name} logo official website`,
		`${brand.name} brand logo png svg`,
	];
	const candidates: Candidate[] = [];
	for (const q of queries) {
		const search = await firecrawl.search(q, { limit: 5 });
		for (const r of search.web ?? []) {
			const url = "url" in r ? r.url : undefined;
			if (!url || !/^https?:/.test(url)) continue;
			try {
				const scraped = await firecrawl.scrape(url, { formats: ["html"] });
				candidates.push(...extractImageCandidates(scraped.html ?? "", url, brand.name));
			} catch (e) {
				console.warn(`scrape failed ${brand.name} ${url}:`, e instanceof Error ? e.message : e);
			}
		}
	}
	return chooseCandidateWithGemini(brand, candidates);
}

async function uploadWithWrangler(localPath: string, key: string, contentType: string) {
	const result = spawnSync("wrangler", ["r2", "object", "put", `${BUCKET}/${key}`, "--file", localPath, "--content-type", contentType, "--remote"], { encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

async function main() {
	if (!process.env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY missing");
	if (!process.env.OPENCODE_GO_API_KEY) throw new Error("OPENCODE_GO_API_KEY missing");
	await mkdir(OUT_DIR, { recursive: true });
	const sql = postgres(`postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`);
	const brands = await sql<Brand[]>`
		select id, name, logo_url
		from ecom_vit_brand
		where deleted_at is null
		  and (logo_url like ${"%/products/%"} or logo_url = ${PLACEHOLDER})
		order by id
		limit ${LIMIT}
	`;
	const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
	const report: unknown[] = [];
	for (const brand of brands) {
		console.log(`\n[${brand.id}] ${brand.name}`);
		try {
			const picked = await findLogo(firecrawl, brand);
			if (!picked) { console.log("  FLAG no usable logo candidate"); report.push({ brand, status: "no_candidate" }); continue; }
			const img = await fetchValidImage(picked.url);
			const ext = extFromContentType(img.contentType);
			const key = `brands/${slugify(brand.name)}.${ext}`;
			const localPath = join(OUT_DIR, basename(key));
			await writeFile(localPath, img.bytes);
			const cdnUrl = `${CDN_BASE_URL}/${key}`;
			if (APPLY) {
				await uploadWithWrangler(localPath, key, img.contentType);
				await sql`update ecom_vit_brand set logo_url = ${cdnUrl}, updated_at = now() where id = ${brand.id}`;
				console.log(`  UPDATED ${cdnUrl}`);
			} else {
				console.log(`  DRY RUN would upload/update ${cdnUrl}`);
			}
			report.push({ brand, status: APPLY ? "updated" : "dry_run", sourceUrl: picked.url, cdnUrl, reason: picked.reason });
		} catch (e) {
			console.log("  FLAG", e instanceof Error ? e.message : e);
			report.push({ brand, status: "error", error: e instanceof Error ? e.message : String(e) });
		}
	}
	await writeFile("tmp/brand-logo-scrape-report.json", JSON.stringify(report, null, 2));
	await sql.end();
	console.log(`\nReport: tmp/brand-logo-scrape-report.json`);
	console.log(APPLY ? "Applied changes." : "Dry run only. Re-run with --apply to upload to R2 and update DB.");
}

main().catch((e) => { console.error(e); process.exit(1); });
