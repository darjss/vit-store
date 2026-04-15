import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "@ai-sdk/google";
import Firecrawl from "@mendable/firecrawl-js";
import { Search } from "@upstash/search";
import { createLogger } from "@vit/logger";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import { and, asc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../src/db";
import {
	BrandsTable,
	CategoriesTable,
	ProductImagesTable,
	ProductsTable,
} from "../src/db/schema";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

loadDotEnv({ path: path.resolve(REPO_ROOT, ".env") });
loadDotEnv({
	path: path.resolve(import.meta.dir, "../../.env"),
	override: false,
});

type ExtractedOnlySourceRow = {
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

type ResolvedReport = {
	extractedOnly: ExtractedOnlySourceRow[];
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
	priceUsd: number | null;
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
	brandId: number | null;
	categoryId: number | null;
};

type EnrichedImportCandidate = {
	originalTitle: string;
	originalDescription: string | null;
	originalFeatures: string[];
	originalIngredients: string[];
	name: string;
	name_mn: string;
	description: string;
	brand: string | null;
	brandId: number | null;
	categoryId: number | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams: number;
	seoTitle: string;
	seoDescription: string;
	ingredients: string[];
	images: { url: string }[];
	sourceUrl: string | null;
	amazonPriceUsd: number | null;
	calculatedPriceMnt: number | null;
	extractionStatus: "success" | "partial" | "failed";
	errors: string[];
	slug: string;
};

type CandidateProduct = {
	id: number;
	name: string;
	slug: string;
	description: string;
	status: string;
	price: number;
	amount: string;
	potency: string;
	brandName: string;
	brandId: number;
	categoryId: number;
	imageUrl: string | null;
};

type DuplicateCandidate = {
	product: CandidateProduct;
	score: number;
	scoreBreakdown: {
		brandScore: number;
		nameScore: number;
		detailScore: number;
		priceScore: number;
	};
};

type DuplicateDecision = {
	decision: "duplicate" | "create" | "needs_review";
	matchedDbId: number | null;
	confidence: "high" | "medium" | "low";
	reason: string;
};

type ImportRowResult =
	| {
			kind: "created";
			canonicalKey: string;
			query: string;
			source: ExtractedOnlySourceRow;
			enriched: EnrichedImportCandidate;
			priceSource: "extracted" | "calculated_fallback";
			createdProductId: number;
			createdImageCount: number;
			candidateProducts: CandidateProduct[];
			decision: DuplicateDecision;
	  }
	| {
			kind: "duplicate";
			canonicalKey: string;
			query: string;
			source: ExtractedOnlySourceRow;
			enriched: EnrichedImportCandidate;
			candidateProducts: CandidateProduct[];
			decision: DuplicateDecision;
	  }
	| {
			kind: "needs_review";
			canonicalKey: string;
			query: string;
			source: ExtractedOnlySourceRow;
			enriched: EnrichedImportCandidate | null;
			candidateProducts: CandidateProduct[];
			decision: DuplicateDecision | null;
			error?: string;
	  }
	| {
			kind: "failed";
			canonicalKey: string;
			query: string;
			source: ExtractedOnlySourceRow;
			enriched: EnrichedImportCandidate | null;
			candidateProducts: CandidateProduct[];
			error: string;
	  };

type Manifest = {
	startedAt: string;
	updatedAt: string;
	scriptVersion: string;
	sourceReportPath: string;
	totalRows: number;
	completedCanonicalKeys: string[];
	createdCount: number;
	duplicateCount: number;
	reviewCount: number;
	failedCount: number;
};

type CliOptions = {
	reportPath: string;
	limit: number | null;
	concurrency: number;
	resume: boolean;
	dryRun: boolean;
	onlyCanonicalKey: string | null;
	status: "active" | "draft";
	outputDir: string;
};

const DEFAULT_BRAND_LOGO_URL = "https://www.placeholder.com/logo.png";
const SCRIPT_VERSION = "1";
const PRICING_FORMULA = {
	slope: 4587,
	intercept: 16929,
	min: 40000,
	max: 500000,
	roundingStep: 5000,
} as const;

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
		priceUsd: {
			type: "number",
			description: "Current buy-box / price-to-pay in USD",
		},
		priceText: {
			type: "string",
			description: "Visible product price text like '$16.95'",
		},
		ingredients: {
			type: "array",
			items: { type: "string" },
			description: "List of ingredients with amounts",
		},
	},
	required: ["title"],
};

const duplicateDecisionSchema = z.object({
	decision: z.enum(["duplicate", "create", "needs_review"]),
	matchedDbId: z.number().int().nullable(),
	confidence: z.enum(["high", "medium", "low"]),
	reason: z.string(),
});

const imageAnalysisSchema = z.object({
	ingredients: z.array(z.string()),
	servingSize: z.string().nullable(),
	dailyIntake: z.number().nullable(),
	supplementFacts: z.string().nullable(),
});

const translationSchema = z.object({
	name: z.string(),
	name_mn: z.string(),
	description: z.string(),
	amount: z.string(),
	potency: z.string(),
	dailyIntake: z.number(),
	weightGrams: z.number(),
	seoTitle: z.string(),
	seoDescription: z.string(),
	ingredients: z.array(z.string()),
	brandId: z.number().nullable(),
	categoryId: z.number().nullable(),
});

const imageSelectionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(8),
	primaryIndex: z.number().int().min(0).nullable(),
});

const options = parseCliArgs(process.argv.slice(2));
const log = createLogger({
	requestId: "import-extracted-only",
	userType: "system",
});

const dbUrl = getDbUrl();
const db = createDb(dbUrl);
const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
if (!firecrawlApiKey) {
	throw new Error("FIRECRAWL_API_KEY is missing in .env");
}
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
	throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing in .env");
}

const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
const searchClient = getSearchClient();

const report = JSON.parse(
	await readFile(options.reportPath, "utf8"),
) as ResolvedReport;
const allRows = report.extractedOnly;
const filteredRows = selectRows(allRows, options);

const resultsDir = path.join(options.outputDir, "results");
const reportsDir = path.join(options.outputDir, "reports");
const manifestPath = path.join(options.outputDir, "manifest.json");

await ensureDir(resultsDir);
await ensureDir(reportsDir);

const manifest = await loadOrCreateManifest(
	manifestPath,
	options.reportPath,
	filteredRows.length,
);

const pendingRows = options.resume
	? filteredRows.filter(
			(row) => !manifest.completedCanonicalKeys.includes(row.canonicalKey),
		)
	: filteredRows;

log.info("importExtractedOnly.start", {
	totalRows: filteredRows.length,
	pendingRows: pendingRows.length,
	dryRun: options.dryRun,
	resume: options.resume,
	concurrency: options.concurrency,
});

await runPool(pendingRows, options.concurrency, async (row) => {
	const resultPath = path.join(resultsDir, `${row.canonicalKey}.json`);

	if (options.resume) {
		try {
			await readFile(resultPath, "utf8");
			return;
		} catch {}
	}

	log.info("importExtractedOnly.row.start", {
		canonicalKey: row.canonicalKey,
		brandName: row.brandName,
		productName: row.productName,
	});

	const result = await processRow(row);
	await writeJsonAtomic(resultPath, result);

	manifest.completedCanonicalKeys = uniqueSorted([
		...manifest.completedCanonicalKeys,
		row.canonicalKey,
	]);
	if (result.kind === "created") manifest.createdCount += 1;
	if (result.kind === "duplicate") manifest.duplicateCount += 1;
	if (result.kind === "needs_review") manifest.reviewCount += 1;
	if (result.kind === "failed") manifest.failedCount += 1;
	manifest.updatedAt = new Date().toISOString();
	await writeJsonAtomic(manifestPath, manifest);
});

const allResults = await loadResultFiles(resultsDir);
await writeJsonAtomic(
	path.join(reportsDir, "created.json"),
	allResults.filter(
		(result): result is Extract<ImportRowResult, { kind: "created" }> =>
			result.kind === "created",
	),
);
await writeJsonAtomic(
	path.join(reportsDir, "duplicates.json"),
	allResults.filter(
		(result): result is Extract<ImportRowResult, { kind: "duplicate" }> =>
			result.kind === "duplicate",
	),
);
await writeJsonAtomic(
	path.join(reportsDir, "needs-review.json"),
	allResults.filter(
		(result): result is Extract<ImportRowResult, { kind: "needs_review" }> =>
			result.kind === "needs_review",
	),
);
await writeJsonAtomic(
	path.join(reportsDir, "failed.json"),
	allResults.filter(
		(result): result is Extract<ImportRowResult, { kind: "failed" }> =>
			result.kind === "failed",
	),
);
await writeJsonAtomic(path.join(reportsDir, "summary.json"), {
	totalRows: filteredRows.length,
	completed: allResults.length,
	created: allResults.filter((result) => result.kind === "created").length,
	duplicates: allResults.filter((result) => result.kind === "duplicate").length,
	needsReview: allResults.filter((result) => result.kind === "needs_review")
		.length,
	failed: allResults.filter((result) => result.kind === "failed").length,
	dryRun: options.dryRun,
});

log.info("importExtractedOnly.done", {
	totalRows: filteredRows.length,
	completed: allResults.length,
	created: allResults.filter((result) => result.kind === "created").length,
	duplicates: allResults.filter((result) => result.kind === "duplicate").length,
	needsReview: allResults.filter((result) => result.kind === "needs_review")
		.length,
	failed: allResults.filter((result) => result.kind === "failed").length,
});

async function processRow(
	row: ExtractedOnlySourceRow,
): Promise<ImportRowResult> {
	const query = buildExtractedSeedQuery(row);

	try {
		const enriched = await enrichProductFromQuery(query);
		const enrichmentMismatch = validateEnrichmentMatch(row, enriched);
		if (enrichmentMismatch) {
			return {
				kind: "needs_review",
				canonicalKey: row.canonicalKey,
				query,
				source: row,
				enriched,
				candidateProducts: [],
				decision: null,
				error: enrichmentMismatch,
			};
		}
		const candidateProducts = await findDuplicateCandidates(
			row,
			enriched,
			query,
		);
		const deterministicCandidates = candidateProducts
			.map((product) => scoreCandidate(row, enriched, product))
			.filter((candidate) => candidate.score >= 0.58)
			.sort((left, right) => right.score - left.score)
			.slice(0, 3);

		let decision: DuplicateDecision;
		if (deterministicCandidates.length === 0) {
			decision = {
				decision: "create",
				matchedDbId: null,
				confidence: "high",
				reason: "No viable duplicate candidates were found.",
			};
		} else {
			decision = await decideDuplicateWithAi(
				row,
				enriched,
				deterministicCandidates,
			);
		}

		if (decision.decision === "duplicate") {
			return {
				kind: "duplicate",
				canonicalKey: row.canonicalKey,
				query,
				source: row,
				enriched,
				candidateProducts: deterministicCandidates.map(
					(candidate) => candidate.product,
				),
				decision,
			};
		}

		if (decision.decision === "needs_review") {
			return {
				kind: "needs_review",
				canonicalKey: row.canonicalKey,
				query,
				source: row,
				enriched,
				candidateProducts: deterministicCandidates.map(
					(candidate) => candidate.product,
				),
				decision,
			};
		}

		const priceResolution = resolveCreatePrice(row, enriched);
		if (!priceResolution) {
			return {
				kind: "failed",
				canonicalKey: row.canonicalKey,
				query,
				source: row,
				enriched,
				candidateProducts: deterministicCandidates.map(
					(candidate) => candidate.product,
				),
				error: "No usable price after extracted/calculated fallback.",
			};
		}

		if (
			!enriched.name ||
			!enriched.slug ||
			enriched.brandId == null ||
			enriched.categoryId == null ||
			!enriched.amount ||
			!enriched.potency
		) {
			return {
				kind: "needs_review",
				canonicalKey: row.canonicalKey,
				query,
				source: row,
				enriched,
				candidateProducts: deterministicCandidates.map(
					(candidate) => candidate.product,
				),
				decision,
				error: "Missing one or more required creation fields.",
			};
		}

		let createdProductId = 0;
		if (!options.dryRun) {
			const [created] = await db
				.insert(ProductsTable)
				.values({
					name: enriched.name,
					slug: enriched.slug,
					description: enriched.description,
					discount: 0,
					amount: enriched.amount,
					potency: enriched.potency,
					stock: 1,
					price: priceResolution.price,
					dailyIntake: enriched.dailyIntake,
					categoryId: enriched.categoryId,
					brandId: enriched.brandId,
					status: options.status,
					name_mn: enriched.name_mn,
					ingredients: enriched.ingredients,
					tags: [],
					seoTitle: enriched.seoTitle,
					seoDescription: enriched.seoDescription,
					weightGrams: enriched.weightGrams,
				})
				.returning({ id: ProductsTable.id });

			createdProductId = created?.id ?? 0;

			if (createdProductId > 0 && enriched.images.length > 0) {
				await db.insert(ProductImagesTable).values(
					enriched.images.map((image, index) => ({
						productId: createdProductId,
						url: image.url,
						isPrimary: index === 0,
					})),
				);
			}
		}

		return {
			kind: "created",
			canonicalKey: row.canonicalKey,
			query,
			source: row,
			enriched,
			priceSource: priceResolution.priceSource,
			createdProductId,
			createdImageCount: enriched.images.length,
			candidateProducts: deterministicCandidates.map(
				(candidate) => candidate.product,
			),
			decision,
		};
	} catch (error) {
		return {
			kind: "failed",
			canonicalKey: row.canonicalKey,
			query,
			source: row,
			enriched: null,
			candidateProducts: [],
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

async function enrichProductFromQuery(
	query: string,
): Promise<EnrichedImportCandidate> {
	let extractionStatus: "success" | "partial" | "failed" = "success";
	const errors: string[] = [];

	const productUrl = isAmazonUrl(query)
		? query
		: await searchAmazonProduct(firecrawl, query);
	if (!productUrl) {
		throw new Error("Could not find product on Amazon from extracted seed.");
	}

	const scrapeResult = await scrapeAmazonProduct(firecrawl, productUrl);
	if (!scrapeResult?.extracted.title) {
		throw new Error("Failed to scrape Amazon product page.");
	}

	const extractedData = scrapeResult.extracted;
	const calculatedPriceMnt =
		typeof extractedData.priceUsd === "number"
			? calculatePriceMntFromUsd(extractedData.priceUsd)
			: null;
	if (calculatedPriceMnt == null) {
		errors.push("Could not extract Amazon USD price.");
		extractionStatus = "partial";
	}

	const imageFilter = await filterProductImages(
		extractedData.title,
		extractedData.images,
	);
	const filteredImages = imageFilter.images;
	if (filteredImages.length === 0 && extractedData.images.length > 0) {
		errors.push("Image filtering removed all candidates.");
		extractionStatus = "partial";
	}

	const visionData =
		filteredImages.length > 0
			? await analyzeProductImages(filteredImages)
			: {
					ingredients: [],
					servingSize: null,
					dailyIntake: null,
					supplementFacts: null,
				};

	if (
		filteredImages.length > 0 &&
		visionData.ingredients.length === 0 &&
		extractedData.ingredients.length === 0
	) {
		errors.push("Could not extract ingredients from images.");
		extractionStatus = "partial";
	}

	if (filteredImages.length === 0) {
		errors.push("No product images found.");
		extractionStatus = "partial";
	}

	const [allBrands, allCategories] = await Promise.all([
		db.query.BrandsTable.findMany({
			where: isNull(BrandsTable.deletedAt),
			orderBy: [asc(BrandsTable.name)],
		}),
		db.query.CategoriesTable.findMany({
			where: isNull(CategoriesTable.deletedAt),
			orderBy: [asc(CategoriesTable.name)],
		}),
	]);

	const structuredData = await translateAndStructureProduct(
		extractedData,
		visionData,
		allBrands.map((brand) => ({ id: brand.id, name: brand.name })),
		allCategories.map((category) => ({ id: category.id, name: category.name })),
	);
	if (!structuredData) {
		errors.push("Translation failed. Using raw data.");
		extractionStatus = "partial";
	}

	const validBrandIds = new Set(allBrands.map((brand) => brand.id));
	const validCategoryIds = new Set(
		allCategories.map((category) => category.id),
	);
	const matchedBrandId =
		structuredData?.brandId != null && validBrandIds.has(structuredData.brandId)
			? structuredData.brandId
			: null;
	const matchedCategoryId =
		structuredData?.categoryId != null &&
		validCategoryIds.has(structuredData.categoryId)
			? structuredData.categoryId
			: null;

	const finalBrandId =
		matchedBrandId ??
		(await resolveOrCreateBrandId(
			extractedData.brand,
			allBrands.map((brand) => ({ id: brand.id, name: brand.name })),
		));

	const allOriginalIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	return {
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
		brandId: finalBrandId,
		categoryId: matchedCategoryId,
		amount: structuredData?.amount || "Unknown",
		potency: structuredData?.potency || "Unknown",
		dailyIntake: structuredData?.dailyIntake || visionData.dailyIntake || 1,
		weightGrams: structuredData?.weightGrams || 200,
		seoTitle: structuredData?.seoTitle || extractedData.title.slice(0, 60),
		seoDescription:
			structuredData?.seoDescription ||
			(extractedData.description || "").slice(0, 155),
		ingredients: structuredData?.ingredients || allOriginalIngredients,
		images: filteredImages.map((url) => ({ url })),
		sourceUrl: productUrl,
		amazonPriceUsd: extractedData.priceUsd,
		calculatedPriceMnt,
		extractionStatus,
		errors,
		slug: generateCleanSlug(
			structuredData?.name || extractedData.title,
			extractedData.brand,
			structuredData?.amount || "Unknown",
			structuredData?.potency || "Unknown",
		),
	};
}

async function resolveOrCreateBrandId(
	brandName: string | null,
	brands: Array<{ id: number; name: string }>,
): Promise<number | null> {
	if (!brandName?.trim()) return null;

	const normalizedTarget = normalizeBrandName(brandName);
	const existing = brands.find(
		(brand) => normalizeBrandName(brand.name) === normalizedTarget,
	);
	if (existing) return existing.id;

	const cleanBrandName = brandName.trim().replace(/\s+/g, " ");
	try {
		const [created] = await db
			.insert(BrandsTable)
			.values({
				name: cleanBrandName,
				logoUrl: DEFAULT_BRAND_LOGO_URL,
			})
			.returning({ id: BrandsTable.id });
		return created?.id ?? null;
	} catch {
		const latest = await db.query.BrandsTable.findMany({
			where: isNull(BrandsTable.deletedAt),
		});
		const matched = latest.find(
			(brand) => normalizeBrandName(brand.name) === normalizedTarget,
		);
		return matched?.id ?? null;
	}
}

async function findDuplicateCandidates(
	_source: ExtractedOnlySourceRow,
	enriched: EnrichedImportCandidate,
	seedQuery: string,
): Promise<CandidateProduct[]> {
	const searchQueries = uniqueStableStrings([
		enriched.name,
		[enriched.brand, enriched.name].filter(Boolean).join(" "),
		[enriched.brand, enriched.name, enriched.potency].filter(Boolean).join(" "),
		seedQuery,
	]);

	const candidateIds = new Set<number>();
	for (const query of searchQueries) {
		const results = await searchProductsViaUpstash(query, 6);
		for (const result of results) {
			candidateIds.add(result.id);
		}
	}

	const directCandidates =
		candidateIds.size > 0
			? await fetchDbProductsByIds(Array.from(candidateIds))
			: await searchDbProductsByName(enriched.name, enriched.brand);

	return uniqueBy(directCandidates, (candidate) => candidate.id);
}

async function decideDuplicateWithAi(
	source: ExtractedOnlySourceRow,
	enriched: EnrichedImportCandidate,
	candidates: DuplicateCandidate[],
): Promise<DuplicateDecision> {
	const firstImage = source.sourceImages[0];
	const imagePath = firstImage
		? path.resolve(REPO_ROOT, "vit", firstImage)
		: null;
	const imageBuffer = imagePath
		? await readFile(imagePath).catch(() => null)
		: null;

	const { object } = await generateObject({
		model: google("gemini-2.5-flash"),
		schema: duplicateDecisionSchema,
		system: [
			"You are deciding whether an extracted-only shelf product already exists in the DB.",
			"Only choose duplicate when it is clearly the exact same sellable product.",
			"Potency differences mean different products.",
			"Capsule/tablet/softgel/gummy count differences mean different products.",
			"Package size differences mean different products.",
			"Allow the DB title to be richer, longer, or cleaner than the extracted or enriched title.",
			"If none is exact and you are unsure, return needs_review.",
		].join(" "),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: [
							"Original extracted-only row:",
							JSON.stringify(source, null, 2),
							"",
							"Enriched product candidate:",
							JSON.stringify(enriched, null, 2),
							"",
							"Top DB candidates:",
							JSON.stringify(
								candidates.map((candidate) => ({
									id: candidate.product.id,
									brandName: candidate.product.brandName,
									name: candidate.product.name,
									amount: candidate.product.amount,
									potency: candidate.product.potency,
									price: candidate.product.price,
									status: candidate.product.status,
									score: Number(candidate.score.toFixed(3)),
									scoreBreakdown: candidate.scoreBreakdown,
								})),
								null,
								2,
							),
							"",
							"Return duplicate only if one DB row is clearly the same exact product.",
						].join("\n"),
					},
					...(enriched.sourceUrl
						? [
								{
									type: "text" as const,
									text: `Source URL: ${enriched.sourceUrl}`,
								},
							]
						: []),
					...(imageBuffer
						? [
								{
									type: "file" as const,
									data: imageBuffer,
									mediaType: getMimeType(imagePath ?? ""),
								},
							]
						: []),
				],
			},
		],
	});

	return {
		decision: object.decision,
		matchedDbId: object.matchedDbId ?? null,
		confidence: object.confidence,
		reason: object.reason,
	};
}

async function searchProductsViaUpstash(query: string, limit = 10) {
	if (!searchClient || !query.trim()) return [];
	try {
		const results = await searchClient.index("products").search({
			query: query.trim(),
			limit,
		});
		return results.map((result) => {
			const metadata = result.metadata as { productId?: number } | undefined;
			return {
				id:
					metadata?.productId ??
					Number.parseInt(result.id.replace("product-", ""), 10),
			};
		});
	} catch (error) {
		log.error("importExtractedOnly.upstashSearchFailed", error, { query });
		return [];
	}
}

async function fetchDbProductsByIds(ids: number[]) {
	if (ids.length === 0) return [];
	const products = await db.query.ProductsTable.findMany({
		where: and(isNull(ProductsTable.deletedAt), inArray(ProductsTable.id, ids)),
		with: {
			brand: true,
			images: {
				where: and(
					eq(ProductImagesTable.isPrimary, true),
					isNull(ProductImagesTable.deletedAt),
				),
			},
		},
	});

	return products.map((product) => ({
		id: product.id,
		name: product.name,
		slug: product.slug,
		description: product.description,
		status: product.status,
		price: product.price,
		amount: product.amount,
		potency: product.potency,
		brandName: product.brand?.name ?? "",
		brandId: product.brandId,
		categoryId: product.categoryId,
		imageUrl: product.images[0]?.url ?? null,
	}));
}

async function searchDbProductsByName(name: string, brandName: string | null) {
	const queryProducts = await db.query.ProductsTable.findMany({
		where: and(
			isNull(ProductsTable.deletedAt),
			or(
				like(ProductsTable.name, `%${name}%`),
				like(ProductsTable.name_mn, `%${name}%`),
			),
		),
		with: {
			brand: true,
			images: {
				where: and(
					eq(ProductImagesTable.isPrimary, true),
					isNull(ProductImagesTable.deletedAt),
				),
			},
		},
		limit: 12,
	});

	return queryProducts
		.filter((product) => {
			if (!brandName?.trim()) return true;
			const normalizedTarget = normalizeText(brandName);
			const normalizedBrand = normalizeText(product.brand?.name ?? "");
			return (
				normalizedBrand === normalizedTarget ||
				normalizedBrand.includes(normalizedTarget) ||
				normalizedTarget.includes(normalizedBrand)
			);
		})
		.map((product) => ({
			id: product.id,
			name: product.name,
			slug: product.slug,
			description: product.description,
			status: product.status,
			price: product.price,
			amount: product.amount,
			potency: product.potency,
			brandName: product.brand?.name ?? "",
			brandId: product.brandId,
			categoryId: product.categoryId,
			imageUrl: product.images[0]?.url ?? null,
		}));
}

function scoreCandidate(
	source: ExtractedOnlySourceRow,
	enriched: EnrichedImportCandidate,
	product: CandidateProduct,
): DuplicateCandidate {
	const extractedBrand = normalizeText(enriched.brand || source.brandName);
	const extractedName = normalizeText(enriched.name);
	const extractedSignals = extractDetailSignals([
		enriched.name,
		enriched.amount,
		enriched.potency,
		source.variant ?? "",
		source.sizeOrCount ?? "",
	]);

	const candidateBrand = normalizeText(product.brandName);
	const candidateName = normalizeText(product.name);
	const candidateSignals = extractDetailSignals([
		product.name,
		product.amount,
		product.potency,
	]);

	const brandScore = exactOrSimilar(extractedBrand, candidateBrand);
	const nameScore = exactOrSimilar(extractedName, candidateName);
	const detailScore = scoreDetailSignals(extractedSignals, candidateSignals);
	const priceScore = comparePrice(
		resolveCreatePrice(source, enriched)?.price ?? null,
		product.price,
	);

	let score =
		brandScore * 0.35 + nameScore * 0.4 + detailScore * 0.2 + priceScore * 0.05;

	if (brandScore < 0.45) score -= 0.25;
	if (nameScore < 0.45) score -= 0.25;
	if (
		hasConflict(extractedSignals.potencyTokens, candidateSignals.potencyTokens)
	) {
		score = 0;
	}
	if (hasConflict(extractedSignals.countTokens, candidateSignals.countTokens)) {
		score = 0;
	}
	if (hasConflict(extractedSignals.sizeTokens, candidateSignals.sizeTokens)) {
		score = 0;
	}

	return {
		product,
		score,
		scoreBreakdown: {
			brandScore: round(brandScore),
			nameScore: round(nameScore),
			detailScore: round(detailScore),
			priceScore: round(priceScore),
		},
	};
}

function validateEnrichmentMatch(
	source: ExtractedOnlySourceRow,
	enriched: EnrichedImportCandidate,
): string | null {
	const sourceBrand = normalizeText(source.brandName);
	const enrichedBrand = normalizeText(enriched.brand ?? "");
	const sourceName = normalizeText(
		[source.productName, source.variant ?? "", source.sizeOrCount ?? ""].join(
			" ",
		),
	);
	const enrichedName = normalizeText(
		[
			enriched.originalTitle,
			enriched.name,
			enriched.originalDescription ?? "",
			...enriched.originalFeatures,
		].join(" "),
	);

	if (
		sourceBrand &&
		enrichedBrand &&
		exactOrSimilar(sourceBrand, enrichedBrand) < 0.5
	) {
		return `Enriched source brand mismatch: extracted "${source.brandName}" vs scraped "${enriched.brand ?? "Unknown"}".`;
	}

	if (
		sourceName &&
		enrichedName &&
		exactOrSimilar(sourceName, enrichedName) < 0.35
	) {
		return `Enriched source name mismatch: extracted "${source.productName}" does not sufficiently match scraped "${enriched.originalTitle}".`;
	}

	const sourceSignals = extractDetailSignals([
		source.productName,
		source.variant ?? "",
		source.sizeOrCount ?? "",
	]);
	const enrichedSignals = extractDetailSignals([
		enriched.originalTitle,
		enriched.amount,
		enriched.potency,
	]);

	if (hasConflict(sourceSignals.potencyTokens, enrichedSignals.potencyTokens)) {
		return "Enriched product conflicts with extracted potency details.";
	}

	if (hasConflict(sourceSignals.countTokens, enrichedSignals.countTokens)) {
		return "Enriched product conflicts with extracted count details.";
	}

	if (hasConflict(sourceSignals.sizeTokens, enrichedSignals.sizeTokens)) {
		return "Enriched product conflicts with extracted size details.";
	}

	return null;
}

function resolveCreatePrice(
	source: ExtractedOnlySourceRow,
	enriched: EnrichedImportCandidate,
): { price: number; priceSource: "extracted" | "calculated_fallback" } | null {
	if (isSaneShelfPrice(source.price)) {
		return { price: source.price, priceSource: "extracted" };
	}
	if (isSaneShelfPrice(enriched.calculatedPriceMnt)) {
		return {
			price: enriched.calculatedPriceMnt,
			priceSource: "calculated_fallback",
		};
	}
	return null;
}

function isSaneShelfPrice(value: number | null): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 40000 &&
		value <= 500000
	);
}

function buildExtractedSeedQuery(row: ExtractedOnlySourceRow): string {
	return [row.brandName, row.productName, row.variant, row.sizeOrCount]
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseCliArgs(argv: string[]): CliOptions {
	let reportPath = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/reports/rebuilt/products-vs-db.resolved.report.json",
	);
	let limit: number | null = null;
	let concurrency = 2;
	let resume = false;
	let dryRun = false;
	let onlyCanonicalKey: string | null = null;
	let status: "active" | "draft" = "active";
	let outputDir = path.resolve(REPO_ROOT, "vit/.vit-ai/import-extracted-only");

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--report")
			reportPath = path.resolve(argv[++index] ?? reportPath);
		if (arg === "--limit") limit = Number.parseInt(argv[++index] ?? "", 10);
		if (arg === "--concurrency") {
			concurrency = Math.max(
				1,
				Number.parseInt(argv[++index] ?? `${concurrency}`, 10),
			);
		}
		if (arg === "--resume") resume = true;
		if (arg === "--dry-run") dryRun = true;
		if (arg === "--only") onlyCanonicalKey = argv[++index] ?? null;
		if (arg === "--status") {
			const candidate = argv[++index];
			if (candidate === "active" || candidate === "draft") status = candidate;
		}
		if (arg === "--output-dir") {
			outputDir = path.resolve(argv[++index] ?? outputDir);
		}
	}

	return {
		reportPath,
		limit,
		concurrency,
		resume,
		dryRun,
		onlyCanonicalKey,
		status,
		outputDir,
	};
}

function selectRows(
	rows: ExtractedOnlySourceRow[],
	cliOptions: CliOptions,
): ExtractedOnlySourceRow[] {
	let selected = rows;
	if (cliOptions.onlyCanonicalKey) {
		selected = selected.filter(
			(row) => row.canonicalKey === cliOptions.onlyCanonicalKey,
		);
	}
	if (cliOptions.limit != null) {
		selected = selected.slice(0, cliOptions.limit);
	}
	return selected;
}

async function loadOrCreateManifest(
	manifestPath: string,
	sourceReportPath: string,
	totalRows: number,
): Promise<Manifest> {
	try {
		return JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
	} catch {
		const now = new Date().toISOString();
		const manifest: Manifest = {
			startedAt: now,
			updatedAt: now,
			scriptVersion: SCRIPT_VERSION,
			sourceReportPath,
			totalRows,
			completedCanonicalKeys: [],
			createdCount: 0,
			duplicateCount: 0,
			reviewCount: 0,
			failedCount: 0,
		};
		await writeJsonAtomic(manifestPath, manifest);
		return manifest;
	}
}

async function loadResultFiles(resultsDir: string): Promise<ImportRowResult[]> {
	const files = (await readdir(resultsDir))
		.filter((file) => file.endsWith(".json"))
		.sort((left, right) => left.localeCompare(right));
	return Promise.all(
		files.map(async (file) => {
			return JSON.parse(
				await readFile(path.join(resultsDir, file), "utf8"),
			) as ImportRowResult;
		}),
	);
}

async function runPool<T>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
) {
	const queue = [...items];
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (!item) return;
				await worker(item);
			}
		}),
	);
}

async function ensureDir(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, data: unknown) {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
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
	throw new Error(
		"DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env",
	);
}

function getSearchClient() {
	if (!process.env.UPSTASH_SEARCH_URL || !process.env.UPSTASH_SEARCH_TOKEN) {
		return null;
	}
	return new Search({
		url: process.env.UPSTASH_SEARCH_URL,
		token: process.env.UPSTASH_SEARCH_TOKEN,
	});
}

function normalizeBrandName(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function generateCleanSlug(
	productName: string,
	brandName: string | null,
	amount: string,
	potency: string,
): string {
	return `${brandName || ""} ${productName} ${potency} ${amount}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|supplement|dietary|capsules|capsule|tablets|tablet|gummies|gummy|liquid|drops|softgels|softgel|veggie|veg|vegetarian)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function exactOrSimilar(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) return 0.94;
	const leftTokens = new Set(left.split(" ").filter(Boolean));
	const rightTokens = new Set(right.split(" ").filter(Boolean));
	const overlap = Array.from(leftTokens).filter((token) =>
		rightTokens.has(token),
	).length;
	return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

type DetailSignals = {
	potencyTokens: string[];
	countTokens: string[];
	sizeTokens: string[];
};

function extractDetailSignals(parts: string[]): DetailSignals {
	const text = parts.join(" ").toLowerCase();
	return {
		potencyTokens: uniqueSorted(
			Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(iu|mcg|mg|g|fu|cfu)\b/g)).map(
				(match) => `${normalizeNumberToken(match[1])}${match[2]}`,
			),
		),
		countTokens: uniqueSorted(
			Array.from(
				text.matchAll(
					/\b(\d[\d,.]*)\s*(capsules|capsule|tablets|tablet|softgels|softgel|soft gels|gummies|gummy|drops|servings|count|packs|packets|chews|caps)\b/g,
				),
			).map(
				(match) =>
					`${normalizeNumberToken(match[1])}${normalizeCountUnit(match[2])}`,
			),
		),
		sizeTokens: uniqueSorted(
			Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(ml|fl oz|oz|lb)\b/g)).map(
				(match) =>
					`${normalizeNumberToken(match[1])}${match[2].replace(/\s+/g, "")}`,
			),
		),
	};
}

function scoreDetailSignals(left: DetailSignals, right: DetailSignals): number {
	const potencyScore = compareTokenSets(
		left.potencyTokens,
		right.potencyTokens,
	);
	const countScore = compareTokenSets(left.countTokens, right.countTokens);
	const sizeScore = compareTokenSets(left.sizeTokens, right.sizeTokens);
	return potencyScore * 0.45 + countScore * 0.4 + sizeScore * 0.15;
}

function compareTokenSets(left: string[], right: string[]): number {
	if (left.length === 0 && right.length === 0) return 0.8;
	if (left.length === 0 || right.length === 0) return 0.45;
	if (hasConflict(left, right)) return 0;
	const overlap = left.filter((token) => right.includes(token)).length;
	return overlap / Math.max(left.length, right.length);
}

function hasConflict(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	return !left.some((token) => right.includes(token));
}

function comparePrice(extractedPrice: number | null, dbPrice: number): number {
	if (extractedPrice === null) return 0.5;
	const delta = Math.abs(extractedPrice - dbPrice);
	if (delta === 0) return 1;
	if (delta <= 5_000) return 0.9;
	if (delta <= 15_000) return 0.75;
	if (delta <= 30_000) return 0.55;
	if (delta <= 60_000) return 0.3;
	return 0;
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

function round(value: number): number {
	return Number.parseFloat(value.toFixed(3));
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string | number): T[] {
	const seen = new Set<string | number>();
	const out: T[] = [];
	for (const value of values) {
		const key = keyFn(value);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}

function uniqueStableStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const normalized = value.trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
}

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
			for (const image of imagesData) {
				const url =
					image.hiRes || image.large || Object.values(image.main || {})[0];
				if (!url) continue;
				const match = url.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
				if (match) imageIds.add(match[1]);
			}
		} catch {}
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
	const patterns = [
		/apex-pricetopay-value[\s\S]{0,300}?class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/apex-pricetopay-accessibility-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/data-pricetopay-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/['"]priceToPay['"]\s*:\s*\{[\s\S]*?['"]amount['"]\s*:\s*['"]?([0-9]+(?:\.[0-9]{1,2})?)['"]?/i,
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (!match) continue;
		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) candidates.push(parsed);
	}
	return candidates.length > 0 ? Math.min(...candidates) : null;
}

function calculatePriceMntFromUsd(amazonPriceUsd: number): number {
	const raw =
		PRICING_FORMULA.slope * amazonPriceUsd + PRICING_FORMULA.intercept;
	const bounded = Math.min(
		PRICING_FORMULA.max,
		Math.max(PRICING_FORMULA.min, raw),
	);
	return (
		Math.round(bounded / PRICING_FORMULA.roundingStep) *
		PRICING_FORMULA.roundingStep
	);
}

async function searchAmazonProduct(
	firecrawlClient: Firecrawl,
	query: string,
): Promise<string | null> {
	try {
		const searchResponse = await firecrawlClient.search(
			`site:amazon.com ${query}`,
			{
				limit: 5,
			},
		);
		if (!searchResponse.web?.length) return null;
		for (const result of searchResponse.web) {
			const url = "url" in result ? result.url : undefined;
			if (url && (url.includes("/dp/") || url.includes("/gp/product/"))) {
				return url;
			}
		}
		const firstResult = searchResponse.web[0];
		const firstUrl = "url" in firstResult ? firstResult.url : undefined;
		return firstUrl?.includes("amazon.com") ? firstUrl : null;
	} catch {
		return null;
	}
}

async function scrapeAmazonProduct(
	firecrawlClient: Firecrawl,
	url: string,
): Promise<{ extracted: FirecrawlExtractedProduct } | null> {
	try {
		const scrapeResponse = await firecrawlClient.scrape(url, {
			formats: [{ type: "json", schema: amazonProductSchema }, "html"],
		});
		const jsonData = (scrapeResponse.json as Record<string, unknown>) || {};
		const html = scrapeResponse.html || "";
		const jsonPriceRaw = jsonData.priceUsd;
		const jsonPrice =
			typeof jsonPriceRaw === "number" &&
			Number.isFinite(jsonPriceRaw) &&
			jsonPriceRaw > 0 &&
			jsonPriceRaw <= 1000
				? jsonPriceRaw
				: null;
		const priceUsd = jsonPrice ?? extractAmazonPriceUsd(html);
		const images = extractProductImageIds(html).map(toHighResUrl);
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
				priceUsd,
			},
		};
	} catch {
		return null;
	}
}

async function analyzeProductImages(
	imageUrls: string[],
): Promise<VisionAnalysisResult> {
	const imagesToAnalyze = imageUrls.slice(0, 4);
	if (imagesToAnalyze.length === 0) {
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}

	try {
		const { object } = await generateObject({
			model: google("gemini-2.5-flash"),
			schema: imageAnalysisSchema,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Analyze these supplement product images. Extract:
1. ALL ingredients from the Supplement Facts label with amounts and % Daily Value
2. Serving size
3. Daily intake (how many to take per day)

Format ingredients as: "Ingredient Name - Amount (% Daily Value)"`,
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
			ingredients: object.ingredients,
			servingSize: object.servingSize ?? null,
			dailyIntake: object.dailyIntake ?? null,
			supplementFacts: object.supplementFacts ?? null,
		};
	} catch {
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}
}

async function translateAndStructureProduct(
	extractedData: FirecrawlExtractedProduct,
	visionData: VisionAnalysisResult,
	brands: Array<{ id: number; name: string }>,
	categories: Array<{ id: number; name: string }>,
): Promise<TranslationResult | null> {
	try {
		const { object } = await generateObject({
			model: google("gemini-2.5-flash"),
			schema: translationSchema,
			prompt: `You are a product specialist for a Mongolian supplement store. Translate this product for Mongolian customers who search in both Cyrillic and Latin scripts.

PRODUCT: ${extractedData.title}
BRAND: ${extractedData.brand || "Unknown"}

FEATURES:
${extractedData.features.map((feature, index) => `${index + 1}. ${feature}`).join("\n")}

DESCRIPTION: ${extractedData.description || "N/A"}

INGREDIENTS: ${[...new Set([...extractedData.ingredients, ...visionData.ingredients])].join("\n") || "Not found"}

SERVING INFO:
- Size: ${visionData.servingSize || extractedData.servingSize || "Unknown"}
- Per Day: ${visionData.dailyIntake || "Unknown"}
- Per Container: ${extractedData.servingsPerContainer || "Unknown"}

AVAILABLE BRANDS:
${brands.map((brand) => `ID ${brand.id}: ${brand.name}`).join("\n")}

AVAILABLE CATEGORIES:
${categories.map((category) => `ID ${category.id}: ${category.name}`).join("\n")}

INSTRUCTIONS:
1. name: Clean English product name without brand
2. name_mn: Mongolian Cyrillic product name
3. description: Mongolian Cyrillic description
4. amount: Count/quantity
5. potency: Strength/potency
6. brandId: match one available brand ID or null
7. categoryId: choose the best category ID or null
8. Keep SEO fields concise and searchable.`,
		});
		return {
			name: object.name,
			name_mn: object.name_mn,
			description: object.description,
			amount: object.amount,
			potency: object.potency,
			dailyIntake: object.dailyIntake,
			weightGrams: object.weightGrams,
			seoTitle: object.seoTitle,
			seoDescription: object.seoDescription,
			ingredients: object.ingredients,
			brandId: object.brandId ?? null,
			categoryId: object.categoryId ?? null,
		};
	} catch {
		return null;
	}
}

function normalizedImageKey(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`
			.toLowerCase()
			.replace(/\/$/, "");
	} catch {
		return url.toLowerCase().split("?")[0] || url.toLowerCase();
	}
}

function isLikelyJunkImage(url: string): boolean {
	const lowered = url.toLowerCase();
	return (
		lowered.includes("thumbnail") ||
		lowered.includes("sprite") ||
		lowered.includes("icon") ||
		lowered.includes("favicon") ||
		lowered.includes("hero") ||
		lowered.includes("banner") ||
		lowered.includes("carousel-placeholder") ||
		lowered.includes("/brands/")
	);
}

async function selectProductImagesWithGemini(
	productName: string,
	candidates: string[],
): Promise<{ keep: string[]; primary: string | null }> {
	if (candidates.length <= 1) {
		return { keep: candidates, primary: candidates[0] ?? null };
	}

	try {
		const { object } = await generateObject({
			model: google("gemini-2.5-flash"),
			schema: imageSelectionSchema,
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

		const keepIndices = Array.from(new Set(object.keepIndices)).filter(
			(index) => index >= 0 && index < candidates.length,
		);
		const keep = (keepIndices.length > 0 ? keepIndices : [0])
			.map((index) => candidates[index])
			.filter((value): value is string => typeof value === "string")
			.slice(0, 8);
		const primary =
			object.primaryIndex != null &&
			object.primaryIndex >= 0 &&
			object.primaryIndex < candidates.length
				? candidates[object.primaryIndex]
				: (keep[0] ?? null);
		return { keep, primary };
	} catch {
		return { keep: candidates.slice(0, 8), primary: candidates[0] ?? null };
	}
}

async function filterProductImages(
	productName: string,
	imageUrls: string[],
): Promise<{ images: string[] }> {
	const deJunk = imageUrls.filter((url) => !isLikelyJunkImage(url));
	const deduped = uniqueBy(deJunk, normalizedImageKey);
	if (deduped.length <= 1) {
		return { images: deduped.slice(0, 8) };
	}

	const picked = await selectProductImagesWithGemini(productName, deduped);
	const uniquePicked = uniqueBy(picked.keep, normalizedImageKey).slice(0, 8);
	if (!picked.primary || uniquePicked.length === 0) {
		return { images: uniquePicked };
	}
	const primaryIndex = uniquePicked.findIndex(
		(url) =>
			normalizedImageKey(url) === normalizedImageKey(picked.primary ?? ""),
	);
	if (primaryIndex > 0) {
		const [head] = uniquePicked.splice(primaryIndex, 1);
		if (head) uniquePicked.unshift(head);
	}
	return { images: uniquePicked };
}

function getMimeType(filePath: string): string {
	const lowered = filePath.toLowerCase();
	if (lowered.endsWith(".png")) return "image/png";
	if (lowered.endsWith(".webp")) return "image/webp";
	return "image/jpeg";
}
