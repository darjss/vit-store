import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv({ path: ".env" });

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const defaultConcurrency = 4;
const defaultModel = "gemini-2.5-flash";
const maxRetries = 3;

const productSchema = z.object({
	brandName: z.string().min(1),
	productName: z.string().min(1),
	priceText: z.string().nullable(),
	priceValue: z.number().int().positive().nullable(),
	variant: z.string().nullable(),
	sizeOrCount: z.string().nullable(),
	confidence: z.number().min(0).max(1),
	reasoning: z
		.string()
		.min(1)
		.describe(
			"Short justification based only on visible label and price text.",
		),
});

const extractionSchema = z.object({
	imageSummary: z.string().min(1),
	products: z.array(productSchema),
});

type ExtractedProduct = z.infer<typeof productSchema>;
type ExtractionResult = z.infer<typeof extractionSchema>;

type ManifestImage = {
	id: string;
	sha256: string;
	originalName: string;
	currentName: string;
	absolutePath: string;
	status: "pending" | "processing" | "done" | "failed";
	attempts: number;
	lastError: string | null;
	updatedAt: string;
	resultFile: string | null;
	renamedTo: string | null;
	sizeBytes: number;
};

type Manifest = {
	version: 1;
	sourceDir: string;
	createdAt: string;
	updatedAt: string;
	images: Record<string, ManifestImage>;
};

type FinalProduct = {
	brandName: string;
	productName: string;
	price: number | null;
	priceText: string | null;
	variant: string | null;
	sizeOrCount: string | null;
	sourceImages: string[];
	aliases: string[];
	confidence: number;
	canonicalKey: string;
};

type CliOptions = {
	dir: string;
	concurrency: number;
	model: string;
	limit: number | null;
	renameImages: boolean;
};

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(args.dir);
const workDir = path.join(sourceDir, ".vit-ai");
const manifestPath = path.join(workDir, "manifest.json");
const resultsDir = path.join(workDir, "results");
const reportsDir = path.join(workDir, "reports");
const renameMapPath = path.join(reportsDir, "rename-map.json");
const finalJsonPath = path.join(reportsDir, "products.final.json");
const rawMergedPath = path.join(reportsDir, "products.raw.json");
let manifestWriteQueue: Promise<void> = Promise.resolve();

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
	throw new Error(
		"Missing GOOGLE_GENERATIVE_AI_API_KEY in environment. The script loads .env automatically.",
	);
}

await mkdir(resultsDir, { recursive: true });
await mkdir(reportsDir, { recursive: true });

const manifest = await loadOrCreateManifest(sourceDir, manifestPath);
await syncManifestWithDirectory(manifest, sourceDir);
await saveManifest(manifest, manifestPath);

const pendingImages = Object.values(manifest.images)
	.filter((image) => image.status !== "done")
	.sort((a, b) => a.currentName.localeCompare(b.currentName))
	.slice(0, args.limit ?? Number.POSITIVE_INFINITY);

console.log(
	JSON.stringify(
		{
			sourceDir,
			totalImages: Object.keys(manifest.images).length,
			pendingImages: pendingImages.length,
			concurrency: args.concurrency,
			model: args.model,
			renameImages: args.renameImages,
		},
		null,
		2,
	),
);

await runPool(pendingImages, args.concurrency, async (image) => {
	await processImage({
		image,
		manifest,
		manifestPath,
		model: args.model,
		resultsDir,
	});
});

const allResults = await collectAllResults(manifest, resultsDir);
await writeTextAtomic(
	rawMergedPath,
	`${JSON.stringify(allResults, null, 2)}\n`,
);

const finalProducts = dedupeProducts(allResults);
await writeTextAtomic(
	finalJsonPath,
	`${JSON.stringify(finalProducts, null, 2)}\n`,
);

const renameMap = args.renameImages
	? await renameImagesFromResults(manifest, manifestPath, finalProducts)
	: [];

await writeTextAtomic(renameMapPath, `${JSON.stringify(renameMap, null, 2)}\n`);

console.log(
	JSON.stringify(
		{
			finalProducts: finalProducts.length,
			rawResultImages: allResults.length,
			finalJsonPath,
			rawMergedPath,
			renameMapPath,
		},
		null,
		2,
	),
);

function parseArgs(argv: string[]): CliOptions {
	let dir = "vit";
	let concurrency = defaultConcurrency;
	let model = defaultModel;
	let limit: number | null = null;
	let renameImages = true;

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];

		if (value === "--dir") {
			dir = argv[index + 1] ?? dir;
			index += 1;
			continue;
		}

		if (value === "--concurrency") {
			const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				concurrency = parsed;
			}
			index += 1;
			continue;
		}

		if (value === "--model") {
			model = argv[index + 1] ?? model;
			index += 1;
			continue;
		}

		if (value === "--limit") {
			const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				limit = parsed;
			}
			index += 1;
			continue;
		}

		if (value === "--no-rename") {
			renameImages = false;
		}
	}

	return {
		dir,
		concurrency,
		model,
		limit,
		renameImages,
	};
}

async function loadOrCreateManifest(
	dir: string,
	filePath: string,
): Promise<Manifest> {
	try {
		const text = await readFile(filePath, "utf8");
		return manifestSchema.parse(JSON.parse(text)) as Manifest;
	} catch {
		return {
			version: 1,
			sourceDir: dir,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			images: {},
		};
	}
}

const manifestImageSchema = z.object({
	id: z.string(),
	sha256: z.string(),
	originalName: z.string(),
	currentName: z.string(),
	absolutePath: z.string(),
	status: z.enum(["pending", "processing", "done", "failed"]),
	attempts: z.number().int().nonnegative(),
	lastError: z.string().nullable(),
	updatedAt: z.string(),
	resultFile: z.string().nullable(),
	renamedTo: z.string().nullable(),
	sizeBytes: z.number().int().nonnegative(),
});

const manifestSchema = z.object({
	version: z.literal(1),
	sourceDir: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	images: z.record(z.string(), manifestImageSchema),
});

async function syncManifestWithDirectory(
	manifest: Manifest,
	dir: string,
): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isFile()) continue;

		const extension = path.extname(entry.name).toLowerCase();
		if (!imageExtensions.has(extension)) continue;

		const absolutePath = path.join(dir, entry.name);
		const fileStat = await stat(absolutePath);
		const sha256 = await hashFile(absolutePath);
		const id = sha256.slice(0, 16);
		const existing = manifest.images[id];

		manifest.images[id] = {
			id,
			sha256,
			originalName: existing?.originalName ?? entry.name,
			currentName: entry.name,
			absolutePath,
			status:
				existing?.status === "done" && existing.resultFile
					? "done"
					: existing?.status === "failed"
						? "failed"
						: "pending",
			attempts: existing?.attempts ?? 0,
			lastError: existing?.lastError ?? null,
			updatedAt: new Date().toISOString(),
			resultFile: existing?.resultFile ?? null,
			renamedTo: existing?.renamedTo ?? null,
			sizeBytes: fileStat.size,
		};
	}
}

async function saveManifest(
	manifest: Manifest,
	filePath: string,
): Promise<void> {
	manifest.updatedAt = new Date().toISOString();
	manifestWriteQueue = manifestWriteQueue.then(() =>
		writeTextAtomic(filePath, `${JSON.stringify(manifest, null, 2)}\n`),
	);
	await manifestWriteQueue;
}

async function hashFile(filePath: string): Promise<string> {
	const buffer = await readFile(filePath);
	return createHash("sha256").update(buffer).digest("hex");
}

async function runPool<T>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
	const running = new Set<Promise<void>>();

	for (const [index, item] of items.entries()) {
		const task = worker(item, index)
			.catch((error: unknown) => {
				console.error("worker_error", error);
			})
			.finally(() => {
				running.delete(task);
			});

		running.add(task);

		if (running.size >= concurrency) {
			await Promise.race(running);
		}
	}

	await Promise.allSettled(running);
}

async function processImage(input: {
	image: ManifestImage;
	manifest: Manifest;
	manifestPath: string;
	model: string;
	resultsDir: string;
}): Promise<void> {
	const { image, manifest, manifestPath, model, resultsDir } = input;
	const liveRecord = manifest.images[image.id];
	liveRecord.status = "processing";
	liveRecord.attempts += 1;
	liveRecord.lastError = null;
	liveRecord.updatedAt = new Date().toISOString();
	await saveManifest(manifest, manifestPath);

	console.log(
		`processing ${liveRecord.currentName} attempt=${liveRecord.attempts}`,
	);

	try {
		const extraction = await extractProductsFromImage(
			liveRecord.absolutePath,
			model,
		);
		const resultPayload = {
			imageId: liveRecord.id,
			sha256: liveRecord.sha256,
			originalName: liveRecord.originalName,
			currentName: liveRecord.currentName,
			absolutePath: liveRecord.absolutePath,
			extractedAt: new Date().toISOString(),
			extraction,
		};
		const resultFile = path.join(resultsDir, `${liveRecord.id}.json`);
		await writeTextAtomic(
			resultFile,
			`${JSON.stringify(resultPayload, null, 2)}\n`,
		);

		liveRecord.status = "done";
		liveRecord.resultFile = resultFile;
		liveRecord.lastError = null;
		liveRecord.updatedAt = new Date().toISOString();
		await saveManifest(manifest, manifestPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		liveRecord.status =
			liveRecord.attempts >= maxRetries ? "failed" : "pending";
		liveRecord.lastError = message;
		liveRecord.updatedAt = new Date().toISOString();
		await saveManifest(manifest, manifestPath);

		console.error(`failed ${liveRecord.currentName}: ${message}`);
	}
}

async function extractProductsFromImage(
	filePath: string,
	modelName: string,
): Promise<ExtractionResult> {
	const imageBuffer = await readFile(filePath);
	const mimeType = getMimeType(filePath);
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
		try {
			const { object } = await generateObject({
				model: google(modelName),
				schema: extractionSchema,
				schemaName: "vit_collage_products",
				schemaDescription:
					"Distinct supplement products visible in a sales collage image with normalized integer MNT prices.",
				system: [
					"You analyze supplement product collage images for a store catalog.",
					"Return only products that are clearly visible in the image.",
					"Extract every distinct product once even if the same item appears multiple times in the same image.",
					"Brand and product names must be based on visible label text, not guesses.",
					"Price is the overlaid sales price text near the product. Normalize Mongolian shorthand like 90k -> 90000.",
					"If a price is not readable, set priceText and priceValue to null.",
					"Do not merge different sizes, counts, or formulations into one product.",
					"Do not invent hidden ingredients or attributes.",
					"Confidence must reflect visual certainty only.",
				].join(" "),
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: [
									"Inspect this product collage carefully and return a strict structured object.",
									"",
									"Rules:",
									"1. List distinct visible products only.",
									"2. If the same product appears more than once in the image, keep one entry.",
									"3. `brandName` should be the manufacturer or product brand visible on the label.",
									"4. `productName` should be the canonical product name visible on the label, excluding the brand when possible.",
									"5. `variant` should hold flavor/form/extra qualifier only when visible.",
									"6. `sizeOrCount` should hold count, weight, volume, or strength if it helps distinguish variants.",
									"7. `priceText` is the exact visible price token such as `90k` or `110k`.",
									"8. `priceValue` must be the normalized integer MNT amount. Example: `90k` => 90000.",
									"9. `reasoning` must be a short evidence note grounded in visible text.",
									"10. Never output duplicate products.",
								].join("\n"),
							},
							{
								type: "file",
								data: imageBuffer,
								mediaType: mimeType,
							},
						],
					},
				],
				experimental_repairText: async ({ text }) => {
					const start = text.indexOf("{");
					const end = text.lastIndexOf("}");
					if (start >= 0 && end > start) {
						return text.slice(start, end + 1);
					}
					return null;
				},
			});

			return normalizeExtraction(object);
		} catch (error) {
			lastError = error;
			if (attempt < maxRetries) {
				await wait(1_500 * attempt);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeExtraction(result: ExtractionResult): ExtractionResult {
	const deduped = new Map<string, ExtractedProduct>();

	for (const product of result.products) {
		const normalizedProduct = normalizeProduct(product);
		const key = canonicalKeyFromProduct(normalizedProduct);
		const existing = deduped.get(key);

		if (!existing || normalizedProduct.confidence > existing.confidence) {
			deduped.set(key, normalizedProduct);
		}
	}

	return {
		imageSummary: result.imageSummary.trim(),
		products: Array.from(deduped.values()).sort((a, b) =>
			`${a.brandName} ${a.productName}`.localeCompare(
				`${b.brandName} ${b.productName}`,
			),
		),
	};
}

function normalizeProduct(product: ExtractedProduct): ExtractedProduct {
	return {
		brandName: compactWhitespace(product.brandName),
		productName: compactWhitespace(product.productName),
		priceText: product.priceText ? compactWhitespace(product.priceText) : null,
		priceValue:
			product.priceValue ?? normalizePriceText(product.priceText ?? undefined),
		variant: product.variant ? compactWhitespace(product.variant) : null,
		sizeOrCount: product.sizeOrCount
			? compactWhitespace(product.sizeOrCount)
			: null,
		confidence: product.confidence,
		reasoning: compactWhitespace(product.reasoning),
	};
}

function normalizePriceText(priceText?: string | null): number | null {
	if (!priceText) return null;

	const cleaned = priceText.toLowerCase().replace(/\s+/g, "");
	const match = cleaned.match(/(\d+(?:[.,]\d+)?)k\b/);
	if (match) {
		return Math.round(Number.parseFloat(match[1].replace(",", ".")) * 1000);
	}

	const digits = cleaned.replace(/[^\d]/g, "");
	if (!digits) return null;

	const value = Number.parseInt(digits, 10);
	return Number.isFinite(value) && value > 0 ? value : null;
}

async function collectAllResults(
	manifest: Manifest,
	resultsDirectory: string,
): Promise<
	Array<{
		imageId: string;
		sha256: string;
		originalName: string;
		currentName: string;
		absolutePath: string;
		extractedAt: string;
		extraction: ExtractionResult;
	}>
> {
	const results: Array<{
		imageId: string;
		sha256: string;
		originalName: string;
		currentName: string;
		absolutePath: string;
		extractedAt: string;
		extraction: ExtractionResult;
	}> = [];

	for (const image of Object.values(manifest.images)) {
		if (!image.resultFile) continue;
		const resultPath = path.isAbsolute(image.resultFile)
			? image.resultFile
			: path.join(resultsDirectory, image.resultFile);
		const text = await readFile(resultPath, "utf8");
		results.push({
			...JSON.parse(text),
			currentName: image.currentName,
			absolutePath: image.absolutePath,
		});
	}

	return results.sort((a, b) => a.currentName.localeCompare(b.currentName));
}

function dedupeProducts(
	allResults: Array<{
		imageId: string;
		currentName: string;
		extraction: ExtractionResult;
	}>,
): FinalProduct[] {
	const grouped = new Map<
		string,
		{
			best: ExtractedProduct;
			sourceImages: Set<string>;
			aliases: Set<string>;
			prices: Map<number | null, number>;
		}
	>();

	for (const result of allResults) {
		for (const product of result.extraction.products) {
			const normalized = normalizeProduct(product);
			const key = canonicalKeyFromProduct(normalized);
			const current = grouped.get(key);

			if (!current) {
				grouped.set(key, {
					best: normalized,
					sourceImages: new Set([result.currentName]),
					aliases: new Set([
						`${normalized.brandName} ${normalized.productName}`.trim(),
					]),
					prices: new Map([[normalized.priceValue, 1]]),
				});
				continue;
			}

			current.sourceImages.add(result.currentName);
			current.aliases.add(
				`${normalized.brandName} ${normalized.productName}`.trim(),
			);
			current.prices.set(
				normalized.priceValue,
				(current.prices.get(normalized.priceValue) ?? 0) + 1,
			);

			if (isBetterProductCandidate(normalized, current.best)) {
				current.best = normalized;
			}
		}
	}

	return Array.from(grouped.entries())
		.map(([canonicalKey, group]) => {
			const price = selectMostCommonPrice(group.prices, group.best.priceValue);

			return {
				brandName: group.best.brandName,
				productName: group.best.productName,
				price,
				priceText:
					price === group.best.priceValue ? group.best.priceText : null,
				variant: group.best.variant,
				sizeOrCount: group.best.sizeOrCount,
				sourceImages: Array.from(group.sourceImages).sort(),
				aliases: Array.from(group.aliases).sort(),
				confidence: group.best.confidence,
				canonicalKey,
			};
		})
		.sort((a, b) =>
			`${a.brandName} ${a.productName}`.localeCompare(
				`${b.brandName} ${b.productName}`,
			),
		);
}

function selectMostCommonPrice(
	prices: Map<number | null, number>,
	fallback: number | null,
): number | null {
	let bestPrice = fallback;
	let bestCount = -1;

	for (const [price, count] of prices.entries()) {
		if (count > bestCount && price !== null) {
			bestPrice = price;
			bestCount = count;
		}
	}

	return bestPrice;
}

function isBetterProductCandidate(
	next: ExtractedProduct,
	current: ExtractedProduct,
): boolean {
	if (next.confidence !== current.confidence) {
		return next.confidence > current.confidence;
	}

	const nextRichness = textRichness(next);
	const currentRichness = textRichness(current);
	return nextRichness > currentRichness;
}

function textRichness(product: ExtractedProduct): number {
	return [
		product.brandName,
		product.productName,
		product.variant ?? "",
		product.sizeOrCount ?? "",
		product.reasoning,
	].join(" ").length;
}

function canonicalKeyFromProduct(product: ExtractedProduct): string {
	const detailSignals = extractDetailSignals([
		product.productName,
		product.variant ?? "",
		product.sizeOrCount ?? "",
	]);

	return [
		normalizeKeyPart(product.brandName),
		normalizeKeyPart(product.productName),
		detailSignals.potencyKey,
		detailSignals.countKey,
		detailSignals.sizeKey,
	]
		.filter(Boolean)
		.join("__");
}

function normalizeKeyPart(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(
			/\b(organic|liquid|drops|capsules|capsule|gummies|gummy|tablets|tablet|softgels|softgel|supplement|dietary|veggie|veg)\b/g,
			" ",
		)
		.replace(/\s+/g, "-")
		.replace(/^-+|-+$/g, "");
}

type DetailSignals = {
	potencyKey: string;
	countKey: string;
	sizeKey: string;
};

function extractDetailSignals(parts: string[]): DetailSignals {
	const text = parts.join(" ").toLowerCase();

	const potencyMatches = Array.from(
		text.matchAll(/\b(\d[\d,.]*)\s*(iu|mcg|mg|g|fu|cfu)\b/g),
	).map((match) => `${normalizeNumberToken(match[1])}${match[2]}`);

	const countMatches = Array.from(
		text.matchAll(
			/\b(\d[\d,.]*)\s*(capsules|capsule|tablets|tablet|softgels|softgel|soft gels|gummies|gummy|drops|servings|count|packs|packets|chews|caps)\b/g,
		),
	).map(
		(match) =>
			`${normalizeNumberToken(match[1])}${normalizeCountUnit(match[2])}`,
	);

	const sizeMatches = Array.from(
		text.matchAll(/\b(\d[\d,.]*)\s*(ml|fl oz|oz|lb)\b/g),
	).map(
		(match) =>
			`${normalizeNumberToken(match[1])}${match[2].replace(/\s+/g, "")}`,
	);

	return {
		potencyKey: uniqueSorted(potencyMatches).join("-"),
		countKey: uniqueSorted(countMatches).join("-"),
		sizeKey: uniqueSorted(sizeMatches).join("-"),
	};
}

function normalizeNumberToken(value: string): string {
	return value.replace(/,/g, "").replace(/\.0+$/, "");
}

function normalizeCountUnit(value: string): string {
	const normalized = value.replace(/\s+/g, "");
	if (normalized === "caps" || normalized === "capsule") return "capsules";
	if (normalized === "tablet") return "tablets";
	if (normalized === "softgel" || normalized === "softgels") return "softgels";
	if (normalized === "gummy") return "gummies";
	if (normalized === "drops") return "drops";
	if (normalized === "servings") return "servings";
	if (normalized === "count") return "count";
	if (normalized === "pack" || normalized === "packs") return "packs";
	if (normalized === "packet" || normalized === "packets") return "packets";
	if (normalized === "chew" || normalized === "chews") return "chews";
	return normalized;
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

async function renameImagesFromResults(
	manifest: Manifest,
	manifestPath: string,
	finalProducts: FinalProduct[],
): Promise<
	Array<{
		from: string;
		to: string;
		id: string;
	}>
> {
	const finalKeySet = new Set(
		finalProducts.map((product) => product.canonicalKey),
	);
	const renameEntries: Array<{ from: string; to: string; id: string }> = [];
	const usedNames = new Set(
		Object.values(manifest.images).map((image) =>
			image.currentName.toLowerCase(),
		),
	);

	for (const image of Object.values(manifest.images).sort((a, b) =>
		a.currentName.localeCompare(b.currentName),
	)) {
		if (!image.resultFile) continue;

		const resultText = await readFile(image.resultFile, "utf8");
		const result = JSON.parse(resultText) as {
			extraction: ExtractionResult;
		};

		const topProducts = result.extraction.products
			.map((product) => normalizeProduct(product))
			.filter((product) => finalKeySet.has(canonicalKeyFromProduct(product)))
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, 2);

		if (topProducts.length === 0) continue;

		const basename = buildImageBasename(topProducts, image.id);
		const extension = path.extname(image.currentName).toLowerCase();
		const candidateName = uniqueFilename(`${basename}${extension}`, usedNames);

		if (candidateName.toLowerCase() === image.currentName.toLowerCase())
			continue;

		const nextPath = path.join(sourceDir, candidateName);
		await rename(image.absolutePath, nextPath);

		usedNames.delete(image.currentName.toLowerCase());
		usedNames.add(candidateName.toLowerCase());

		renameEntries.push({
			from: image.currentName,
			to: candidateName,
			id: image.id,
		});

		image.currentName = candidateName;
		image.absolutePath = nextPath;
		image.renamedTo = candidateName;
		image.updatedAt = new Date().toISOString();
		await saveManifest(manifest, manifestPath);
	}

	return renameEntries;
}

function uniqueFilename(candidate: string, usedNames: Set<string>): string {
	const extension = path.extname(candidate);
	const stem = path.basename(candidate, extension);
	let current = candidate;
	let suffix = 2;

	while (usedNames.has(current.toLowerCase())) {
		current = `${stem}-${suffix}${extension}`;
		suffix += 1;
	}

	return current;
}

function buildImageBasename(
	products: ExtractedProduct[],
	imageId: string,
): string {
	const pieces = products.flatMap((product) => [
		slugify(product.brandName),
		slugify(product.productName),
	]);

	const concise = pieces.filter(Boolean).slice(0, 4).join("-");
	return `${concise || "vit-collage"}__${imageId}`;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function getMimeType(filePath: string): string {
	switch (path.extname(filePath).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempFile = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
	await writeFile(tempFile, text, "utf8");
	await rename(tempFile, filePath);
}
