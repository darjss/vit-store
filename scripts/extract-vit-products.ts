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
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv({ path: ".env" });

const opencode = createOpenAICompatible({
	baseURL: "https://opencode.ai/zen/go/v1",
	apiKey: process.env.OPENCODE_GO_API_KEY,
	name: "opencode-go",
	supportsStructuredOutputs: true,
});

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const defaultConcurrency = 4;
const defaultOpenCodeModel = "kimi-k2.5";
const maxRetries = 3;
const maxExistingProductsInPrompt = 220;

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

type ManualMergeOverride = {
	canonicalKeys: string[];
	reason: string;
};

type CliOptions = {
	dir: string;
	concurrency: number;
	model: string;
	outputName: string;
	limit: number | null;
	renameImages: boolean;
	rebuildOnly: boolean;
	existingJsonPaths: string[];
	mergeOverridesPath: string | null;
};

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(args.dir);
const workDir = path.join(sourceDir, ".vit-ai");
const manifestPath = path.join(workDir, "manifest.json");
const resultsDir = path.join(workDir, "results");
const reportsDir = path.join(workDir, "reports");
const renameMapPath = path.join(reportsDir, "rename-map.json");
const finalJsonPath = path.join(reportsDir, args.outputName);
const rawMergedPath = path.join(reportsDir, "products.raw.json");
const defaultMergeOverridesPath = path.join(
	reportsDir,
	"extracted-merge-overrides.json",
);
let manifestWriteQueue: Promise<void> = Promise.resolve();

if (!process.env.OPENCODE_GO_API_KEY) {
	throw new Error(
		"Missing OPENCODE_GO_API_KEY in environment. The script loads .env automatically.",
	);
}

await mkdir(resultsDir, { recursive: true });
await mkdir(reportsDir, { recursive: true });

const manifest = await loadOrCreateManifest(sourceDir, manifestPath);
await syncManifestWithDirectory(manifest, sourceDir);
await syncManifestWithResultFiles(manifest, resultsDir);
await saveManifest(manifest, manifestPath);
const existingProducts = await loadExistingFinalProducts(args.existingJsonPaths);
const existingProductContext = formatExistingProductContext(existingProducts);
const manualMergeOverrides = await loadManualMergeOverrides(
	args.mergeOverridesPath ?? defaultMergeOverridesPath,
);

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
			outputName: args.outputName,
			renameImages: args.renameImages,
			rebuildOnly: args.rebuildOnly,
			existingProducts: existingProducts.length,
			manualMergeOverrides: manualMergeOverrides.length,
		},
		null,
		2,
	),
);

if (!args.rebuildOnly) {
	await runPool(pendingImages, args.concurrency, async (image) => {
		await processImage({
			image,
			manifest,
			manifestPath,
			extractor: {
				model: args.model,
				existingProductContext,
			},
			resultsDir,
		});
	});
}

const allResults = await collectAllResults(manifest, resultsDir);
await writeTextAtomic(
	rawMergedPath,
	`${JSON.stringify(allResults, null, 2)}\n`,
);

const finalProducts = applyManualMergeOverrides(
	consolidateNearDuplicates(dedupeProducts(allResults, existingProducts)),
	manualMergeOverrides,
);
const duplicateKeys = findDuplicateCanonicalKeys(finalProducts);
if (duplicateKeys.length > 0) {
	throw new Error(
		`Final product JSON still has duplicate canonical keys: ${duplicateKeys.join(
			", ",
		)}`,
	);
}
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
	let model = defaultOpenCodeModel;
	let outputName = "products.final.deduped.json";
	let limit: number | null = null;
	let renameImages = true;
	let rebuildOnly = false;
	const existingJsonPaths: string[] = [];
	let mergeOverridesPath: string | null = null;

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

		if (value === "--output-name") {
			const nextOutputName = argv[index + 1];
			if (nextOutputName) outputName = path.basename(nextOutputName);
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

		if (value === "--rebuild-only") {
			rebuildOnly = true;
			continue;
		}

		if (value === "--existing-json") {
			const existingPath = argv[index + 1];
			if (existingPath) existingJsonPaths.push(existingPath);
			index += 1;
			continue;
		}

		if (value === "--merge-overrides") {
			mergeOverridesPath = argv[index + 1] ?? null;
			index += 1;
			continue;
		}
	}

	return {
		dir,
		concurrency,
		model,
		outputName,
		limit,
		renameImages,
		rebuildOnly,
		existingJsonPaths,
		mergeOverridesPath,
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

async function syncManifestWithResultFiles(
	manifest: Manifest,
	resultsDirectory: string,
): Promise<void> {
	for (const image of Object.values(manifest.images)) {
		const resultFile = path.join(resultsDirectory, `${image.id}.json`);
		if (!(await fileExists(resultFile))) continue;

		image.status = "done";
		image.resultFile = resultFile;
		image.lastError = null;
		image.updatedAt = new Date().toISOString();
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
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
	extractor: {
		model: string;
		existingProductContext: string | null;
	};
	resultsDir: string;
}): Promise<void> {
	const { image, manifest, manifestPath, extractor, resultsDir } = input;
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
			extractor,
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
	extractor: {
		model: string;
		existingProductContext: string | null;
	},
): Promise<ExtractionResult> {
	const imageBuffer = await readFile(filePath);
	const mimeType = getMimeType(filePath);
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
		try {
			return normalizeExtraction(
				await extractProductsOnce({
					imageBuffer,
					mimeType,
					extractor,
				}),
			);
		} catch (error) {
			lastError = error;
			if (attempt < maxRetries) {
				await wait(1_500 * attempt);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function extractProductsOnce(input: {
	imageBuffer: Buffer;
	mimeType: string;
	extractor: {
		model: string;
		existingProductContext: string | null;
	};
}): Promise<ExtractionResult> {
	const { imageBuffer, mimeType, extractor } = input;

	return extractProductsWithOpenCode({
		imageBuffer,
		mimeType,
		modelName: extractor.model,
		existingProductContext: extractor.existingProductContext,
	});
}

async function extractProductsWithOpenCode(input: {
	imageBuffer: Buffer;
	mimeType: string;
	modelName: string;
	existingProductContext: string | null;
}): Promise<ExtractionResult> {
	const apiKey = process.env.OPENCODE_GO_API_KEY;
	if (!apiKey) throw new Error("Missing OPENCODE_GO_API_KEY for OpenCode extraction.");

	let lastError: unknown = null;
	for (const modelName of candidateOpenCodeModels(input.modelName)) {
		try {
			return await generateOpenCodeExtraction({
				modelName,
				imageBuffer: input.imageBuffer,
				mimeType: input.mimeType,
				existingProductContext: input.existingProductContext,
			});
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function generateOpenCodeExtraction(input: {
	modelName: string;
	imageBuffer: Buffer;
	mimeType: string;
	existingProductContext: string | null;
}): Promise<ExtractionResult> {
	const { object } = await generateObject({
		model: opencode(input.modelName),
		schema: extractionSchema,
		schemaName: "vit_collage_products",
		schemaDescription:
			"Distinct supplement products visible in a sales collage image with normalized integer MNT prices.",
		system: buildSystemPrompt(),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: buildUserPrompt(input.existingProductContext),
					},
					{
						type: "file",
						data: input.imageBuffer,
						mediaType: input.mimeType,
					},
				],
			},
		],
	});

	return object;
}

function buildSystemPrompt(): string {
	return [
		"You analyze supplement product collage images for a store catalog.",
		"Return only products that are clearly visible in the image.",
		"Extract every distinct product once even if the same item appears multiple times in the same image.",
		"Brand and product names must be based on visible label text, not guesses.",
		"Price is the overlaid black sales price text near the product. Normalize Mongolian shorthand like 90k -> 90000.",
		"If a price is not readable, set priceText and priceValue to null.",
		"Do not merge different sizes, counts, potencies, or formulations into one product.",
		"Do not invent hidden ingredients or attributes.",
		"Confidence must reflect visual certainty only.",
	].join(" ");
}

function buildUserPrompt(existingProductContext: string | null): string {
	return [
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
		existingProductContext
			? [
					"",
					"Existing extracted products for name normalization only:",
					existingProductContext,
					"If a visible product matches this existing list, still return it once; reuse the closest existing brand/name spelling when the label supports it.",
				].join("\n")
			: "",
	].join("\n");
}

function candidateOpenCodeModels(modelName: string): string[] {
	const normalized = modelName.toLowerCase().trim();
	const candidates = [modelName];

	if (normalized === "kimi") {
		candidates.push("kimi-k2.5");
	}

	return Array.from(new Set(candidates));
}

async function loadExistingFinalProducts(paths: string[]): Promise<FinalProduct[]> {
	const loaded: FinalProduct[] = [];

	for (const inputPath of paths) {
		const filePath = path.resolve(inputPath);
		const text = await readFile(filePath, "utf8");
		const parsed = JSON.parse(text) as unknown;
		if (!Array.isArray(parsed)) {
			throw new Error(`Existing JSON must be an array: ${filePath}`);
		}

		for (const value of parsed) {
			loaded.push(normalizeFinalProduct(value));
		}
	}

	return consolidateNearDuplicates(mergeFinalProducts(loaded));
}

function normalizeFinalProduct(value: unknown): FinalProduct {
	const record = value as Partial<FinalProduct> & {
		priceValue?: number | null;
	};
	const brandName = compactWhitespace(String(record.brandName ?? ""));
	const productName = compactWhitespace(String(record.productName ?? ""));

	if (!brandName || !productName) {
		throw new Error("Existing product JSON contains an item without brand/name.");
	}

	const price =
		typeof record.price === "number"
			? record.price
			: typeof record.priceValue === "number"
				? record.priceValue
				: normalizePriceText(record.priceText ?? undefined);
	const normalized: FinalProduct = {
		brandName,
		productName,
		price,
		priceText:
			typeof record.priceText === "string"
				? compactWhitespace(record.priceText)
				: null,
		variant:
			typeof record.variant === "string"
				? compactWhitespace(record.variant)
				: null,
		sizeOrCount:
			typeof record.sizeOrCount === "string"
				? compactWhitespace(record.sizeOrCount)
				: null,
		sourceImages: Array.isArray(record.sourceImages)
			? uniqueSorted(record.sourceImages.map(String).filter(Boolean))
			: [],
		aliases: Array.isArray(record.aliases)
			? uniqueSorted(record.aliases.map(String).filter(Boolean))
			: [],
		confidence:
			typeof record.confidence === "number"
				? Math.max(0, Math.min(record.confidence, 1))
				: 0.75,
		canonicalKey: "",
	};

	normalized.aliases = uniqueSorted([
		...normalized.aliases,
		`${normalized.brandName} ${normalized.productName}`.trim(),
	]);
	normalized.canonicalKey = canonicalKeyFromFinalProduct(normalized);
	return normalized;
}

function formatExistingProductContext(products: FinalProduct[]): string | null {
	if (products.length === 0) return null;

	return products
		.slice(0, maxExistingProductsInPrompt)
		.map((product) =>
			[
				product.brandName,
				product.productName,
				product.variant,
				product.sizeOrCount,
			]
				.filter(Boolean)
				.join(" | "),
		)
		.join("\n");
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
	existingProducts: FinalProduct[],
): FinalProduct[] {
	const products: FinalProduct[] = [...existingProducts];
	const grouped = new Map<string, ProductGroup>();

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

	products.push(...Array.from(grouped.values()).map(finalProductFromGroup));
	return mergeFinalProducts(products);
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

type ProductGroup = {
	best: ExtractedProduct;
	sourceImages: Set<string>;
	aliases: Set<string>;
	prices: Map<number | null, number>;
};

function finalProductFromGroup(group: ProductGroup): FinalProduct {
	const price = selectMostCommonPrice(group.prices, group.best.priceValue);
	const product: FinalProduct = {
		brandName: group.best.brandName,
		productName: group.best.productName,
		price,
		priceText: price === group.best.priceValue ? group.best.priceText : null,
		variant: group.best.variant,
		sizeOrCount: group.best.sizeOrCount,
		sourceImages: Array.from(group.sourceImages).sort(),
		aliases: Array.from(group.aliases).sort(),
		confidence: group.best.confidence,
		canonicalKey: "",
	};
	product.canonicalKey = canonicalKeyFromFinalProduct(product);
	return product;
}

function mergeFinalProducts(products: FinalProduct[]): FinalProduct[] {
	const grouped = new Map<
		string,
		{
			best: FinalProduct;
			sourceImages: Set<string>;
			aliases: Set<string>;
			prices: Map<number | null, number>;
		}
	>();

	for (const product of products) {
		const normalized = normalizeFinalProduct(product);
		const key = canonicalKeyFromFinalProduct(normalized);
		const current = grouped.get(key);

		if (!current) {
			grouped.set(key, {
				best: normalized,
				sourceImages: new Set(normalized.sourceImages),
				aliases: new Set(normalized.aliases),
				prices: new Map([[normalized.price, 1]]),
			});
			continue;
		}

		for (const sourceImage of normalized.sourceImages) {
			current.sourceImages.add(sourceImage);
		}
		for (const alias of normalized.aliases) {
			current.aliases.add(alias);
		}
		current.prices.set(
			normalized.price,
			(current.prices.get(normalized.price) ?? 0) + 1,
		);

		if (isPreferredFinalProduct(normalized, current.best)) {
			current.best = normalized;
		}
	}

	return Array.from(grouped.values())
		.map((group) => {
			const price = selectMostCommonPrice(group.prices, group.best.price);
			const product: FinalProduct = {
				...group.best,
				price,
				priceText: price === group.best.price ? group.best.priceText : null,
				sourceImages: uniqueSorted(Array.from(group.sourceImages)),
				aliases: uniqueSorted([
					...Array.from(group.aliases),
					`${group.best.brandName} ${group.best.productName}`.trim(),
				]),
				canonicalKey: "",
			};
			product.canonicalKey = canonicalKeyFromFinalProduct(product);
			return product;
		})
		.sort((a, b) =>
			`${a.brandName} ${a.productName}`.localeCompare(
				`${b.brandName} ${b.productName}`,
			),
		);
}

function consolidateNearDuplicates(products: FinalProduct[]): FinalProduct[] {
	const groupedByDetail = new Map<string, FinalProduct[]>();

	for (const product of products.map(normalizeFinalProduct)) {
		const groupKey = [
			normalizeKeyPart(product.brandName),
			normalizeKeyPart(product.productName),
		].join("__");
		const group = groupedByDetail.get(groupKey) ?? [];
		group.push(product);
		groupedByDetail.set(groupKey, group);
	}

	const consolidated: FinalProduct[] = [];

	for (const group of groupedByDetail.values()) {
		const merged: FinalProduct[] = [];

		for (const product of group) {
			const existing = merged.find((candidate) =>
				shouldMergeProducts(candidate, product),
			);

			if (!existing) {
				merged.push(product);
				continue;
			}

			const preferred = isPreferredFinalProduct(product, existing)
				? product
				: existing;
			existing.brandName = preferred.brandName;
			existing.productName = preferred.productName;
			existing.variant = preferred.variant;
			existing.sizeOrCount = preferred.sizeOrCount;
			existing.price = preferred.price ?? existing.price ?? product.price;
			existing.priceText =
				preferred.price === existing.price ? preferred.priceText : null;
			existing.confidence = Math.max(existing.confidence, product.confidence);
			existing.sourceImages = uniqueSorted([
				...existing.sourceImages,
				...product.sourceImages,
			]);
			existing.aliases = uniqueSorted([
				...existing.aliases,
				...product.aliases,
				`${product.brandName} ${product.productName}`.trim(),
			]);
			existing.canonicalKey = canonicalKeyFromFinalProduct(existing);
		}

		consolidated.push(...merged);
	}

	return mergeFinalProducts(consolidated);
}

function applyManualMergeOverrides(
	products: FinalProduct[],
	overrides: ManualMergeOverride[],
): FinalProduct[] {
	if (overrides.length === 0) return products;

	let nextProducts = products.map(normalizeFinalProduct);

	for (const override of overrides) {
		const overrideKeys = new Set(override.canonicalKeys);
		const matches = nextProducts.filter((product) =>
			overrideKeys.has(product.canonicalKey),
		);
		if (matches.length < 2) continue;

		const merged = matches.reduce((best, current) =>
			isPreferredFinalProduct(current, best) ? current : best,
		);
		const combinedPrices = new Map<number | null, number>();
		for (const match of matches) {
			combinedPrices.set(
				match.price,
				(combinedPrices.get(match.price) ?? 0) + 1,
			);
		}

		const mergedProduct: FinalProduct = {
			...merged,
			price: selectMostCommonPrice(combinedPrices, merged.price),
			priceText: merged.priceText,
			sourceImages: uniqueSorted(
				matches.flatMap((product) => product.sourceImages),
			),
			aliases: uniqueSorted(
				matches.flatMap((product) => [
					...product.aliases,
					`${product.brandName} ${product.productName}`.trim(),
				]),
			),
			confidence: Math.max(...matches.map((product) => product.confidence)),
			canonicalKey: "",
		};
		mergedProduct.canonicalKey = canonicalKeyFromFinalProduct(mergedProduct);

		const consumedKeys = new Set(
			matches.map((product) => product.canonicalKey),
		);
		nextProducts = nextProducts.filter(
			(product) => !consumedKeys.has(product.canonicalKey),
		);
		nextProducts.push(mergedProduct);
	}

	return mergeFinalProducts(nextProducts);
}

function shouldMergeProducts(left: FinalProduct, right: FinalProduct): boolean {
	if (normalizeKeyPart(left.brandName) !== normalizeKeyPart(right.brandName)) {
		return false;
	}

	if (!detailSignalsCompatible(left, right)) return false;

	const leftName = normalizeComparableProductName(left.productName);
	const rightName = normalizeComparableProductName(right.productName);

	if (!leftName || !rightName) return false;
	if (leftName === rightName) return true;
	if (leftName.includes(rightName) || rightName.includes(leftName)) return true;

	const leftTokens = new Set(leftName.split(" ").filter(Boolean));
	const rightTokens = new Set(rightName.split(" ").filter(Boolean));

	if (leftTokens.size === 0 || rightTokens.size === 0) return false;

	const leftWithinRight = Array.from(leftTokens).every((token) =>
		rightTokens.has(token),
	);
	const rightWithinLeft = Array.from(rightTokens).every((token) =>
		leftTokens.has(token),
	);

	return leftWithinRight || rightWithinLeft;
}

function detailSignalsCompatible(left: FinalProduct, right: FinalProduct): boolean {
	const leftSignals = extractDetailSignals([
		left.productName,
		left.variant ?? "",
		left.sizeOrCount ?? "",
	]);
	const rightSignals = extractDetailSignals([
		right.productName,
		right.variant ?? "",
		right.sizeOrCount ?? "",
	]);

	return (
		!hasConflictingSignal(leftSignals.potencyKey, rightSignals.potencyKey) &&
		!hasConflictingSignal(leftSignals.countKey, rightSignals.countKey) &&
		!hasConflictingSignal(leftSignals.sizeKey, rightSignals.sizeKey)
	);
}

function hasConflictingSignal(left: string, right: string): boolean {
	if (!left || !right) return false;
	const leftTokens = left.split("-").filter(Boolean);
	const rightTokens = right.split("-").filter(Boolean);
	if (leftTokens.length === 0 || rightTokens.length === 0) return false;
	return !leftTokens.some((token) => rightTokens.includes(token));
}

function normalizeComparableName(product: FinalProduct): string {
	return [product.productName, product.variant ?? ""]
		.join(" ")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|for|plus|supplement|dietary|made|highly|bioavailable|natural|flavor|flavored|unflavored|powder|liquid)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeComparableProductName(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|for|plus|supplement|dietary|made|highly|bioavailable|natural|flavor|flavored|unflavored|powder|liquid)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function isPreferredFinalProduct(
	next: FinalProduct,
	current: FinalProduct,
): boolean {
	if (next.confidence !== current.confidence) {
		return next.confidence > current.confidence;
	}

	return finalProductRichness(next) > finalProductRichness(current);
}

function finalProductRichness(product: FinalProduct): number {
	return [
		product.brandName,
		product.productName,
		product.variant ?? "",
		product.sizeOrCount ?? "",
		product.aliases.join(" "),
	].join(" ").length;
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

function canonicalKeyFromFinalProduct(product: FinalProduct): string {
	return canonicalKeyFromProduct({
		brandName: product.brandName,
		productName: product.productName,
		priceText: product.priceText,
		priceValue: product.price,
		variant: product.variant,
		sizeOrCount: product.sizeOrCount,
		confidence: product.confidence,
		reasoning: "",
	});
}

function findDuplicateCanonicalKeys(products: FinalProduct[]): string[] {
	const counts = new Map<string, number>();
	for (const product of products) {
		counts.set(product.canonicalKey, (counts.get(product.canonicalKey) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.filter(([, count]) => count > 1)
		.map(([key]) => key)
		.sort((left, right) => left.localeCompare(right));
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
			/\b(\d[\d,.]*)\s*(?:veggie|vegetarian|vegan|chewable)?\s*(capsules|capsule|tablets|tablet|softgels|softgel|soft gels|gummies|gummy|drops|servings|count|packs|packets|chews|caps)\b/g,
		),
	).map((match) => normalizeNumberToken(match[1]));

	const sizeMatches = Array.from(
		text.matchAll(/\b(\d[\d,.]*)\s*(fl oz|ml|milliliters?|oz|g|grams?|lb)\b/g),
	).map((match) => normalizeSizeToken(match[1], match[2]));

	return {
		potencyKey: uniqueSorted(potencyMatches).join("-"),
		countKey: uniqueSorted(countMatches).join("-"),
		sizeKey: uniqueSorted(sizeMatches).join("-"),
	};
}

function normalizeNumberToken(value: string): string {
	return value.replace(/,/g, "").replace(/\.0+$/, "");
}

function normalizeSizeToken(amount: string, unit: string): string {
	const value = Number.parseFloat(amount.replace(",", "."));
	if (!Number.isFinite(value)) return `${normalizeNumberToken(amount)}${unit}`;

	const normalizedUnit = unit.toLowerCase().replace(/\s+/g, " ");
	if (normalizedUnit === "fl oz") {
		return `${roundToStep(value * 29.5735, 5)}ml`;
	}
	if (normalizedUnit === "ml" || normalizedUnit.startsWith("milliliter")) {
		return `${roundToStep(value, 5)}ml`;
	}
	if (normalizedUnit === "oz") {
		return `${roundToStep(value * 28.3495, 5)}g`;
	}
	if (normalizedUnit === "lb") {
		return `${roundToStep(value * 453.592, 10)}g`;
	}
	if (normalizedUnit === "g" || normalizedUnit.startsWith("gram")) {
		return `${roundToStep(value, 5)}g`;
	}

	return `${normalizeNumberToken(amount)}${normalizedUnit.replace(/\s+/g, "")}`;
}

function roundToStep(value: number, step: number): number {
	return Math.round(value / step) * step;
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

async function loadManualMergeOverrides(
	filePath: string,
): Promise<ManualMergeOverride[]> {
	try {
		const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
		if (!Array.isArray(parsed)) return [];

		return parsed
			.map((value) => {
				const record = value as Partial<ManualMergeOverride>;
				return {
					canonicalKeys: Array.isArray(record.canonicalKeys)
						? record.canonicalKeys.map(String).filter(Boolean)
						: [],
					reason:
						typeof record.reason === "string"
							? record.reason
							: "manual merge override",
				};
			})
			.filter((override) => override.canonicalKeys.length >= 2);
	} catch {
		return [];
	}
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
