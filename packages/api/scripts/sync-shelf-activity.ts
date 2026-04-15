import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { createDb } from "../src/db";
import { ProductImagesTable, ProductsTable } from "../src/db/schema";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

loadDotEnv({ path: path.resolve(REPO_ROOT, ".env") });
loadDotEnv({
	path: path.resolve(import.meta.dir, "../../.env"),
	override: false,
});

type ExtractedProduct = {
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

type ResolvedStrongMatch = {
	extracted: ExtractedProduct;
	db: {
		id: number;
		price: number;
		status: string;
		stock: number;
	};
};

type ResolvedPriceMismatch = {
	extracted: ExtractedProduct;
	db: {
		id: number;
		price: number;
		status: string;
		stock: number;
	};
};

type ResolvedReport = {
	strongMatches: ResolvedStrongMatch[];
	extractedOnly: ExtractedProduct[];
	dbOnly: Array<{ id: number }>;
	priceMismatches: ResolvedPriceMismatch[];
};

type ImportEnriched = {
	name: string;
	name_mn: string;
	description: string;
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
	calculatedPriceMnt: number | null;
	slug: string;
};

type ImportResult =
	| {
			kind: "created";
			canonicalKey: string;
			source: ExtractedProduct;
			enriched: ImportEnriched;
			priceSource: "extracted" | "calculated_fallback";
	  }
	| {
			kind: "needs_review";
			canonicalKey: string;
			source: ExtractedProduct;
			enriched: ImportEnriched | null;
			error?: string;
	  }
	| {
			kind: "duplicate" | "failed";
			canonicalKey: string;
			source: ExtractedProduct;
			enriched: ImportEnriched | null;
			error?: string;
	  };

type ReviewPassCreate = {
	canonicalKey: string;
};

type DuplicateGroup = Array<{
	id: number;
	price: number;
}>;

type CliOptions = {
	reportPath: string;
	importDir: string;
	outputDir: string;
	dryRun: boolean;
	deactivateStatus: "draft" | "out_of_stock";
};

type SyncSummary = {
	reportPath: string;
	importDir: string;
	dryRun: boolean;
	currentExtractedOnly: number;
	createCandidates: number;
	createdCount: number;
	reusedExistingCount: number;
	skippedCreateCount: number;
	activatedCount: number;
	draftedCount: number;
	priceUpdatedCount: number;
	activeDbIds: number[];
	draftDbIds: number[];
};

const options = parseCliArgs(process.argv.slice(2));
const dbUrl = getDbUrl();
const db = createDb(dbUrl);

const report = JSON.parse(
	await readFile(options.reportPath, "utf8"),
) as ResolvedReport;
const importResultsDir = path.join(options.importDir, "results");
const importReviewCreatesPath = path.join(
	options.importDir,
	"review-pass",
	"reports",
	"creates.json",
);
const duplicateGroupsPath = path.resolve(
	REPO_ROOT,
	"vit/.vit-ai/reports/rebuilt/db-only-duplicate-groups.json",
);

await ensureDir(options.outputDir);
await ensureDir(path.join(options.outputDir, "reports"));

const reviewPassCreates = new Set(
	(
		JSON.parse(
			await readFile(importReviewCreatesPath, "utf8").catch(() => "[]"),
		) as ReviewPassCreate[]
	).map((item) => item.canonicalKey),
);

const importResults = await loadImportResults(importResultsDir);
const duplicateGroups = (
	JSON.parse(
		await readFile(duplicateGroupsPath, "utf8").catch(() => "[]"),
	) as DuplicateGroup[]
).filter((group) => group.length > 1);

const createCandidates = report.extractedOnly.filter((item) => {
	const result = importResults.get(item.canonicalKey);
	if (!result?.enriched) return false;
	return result.kind === "created" || reviewPassCreates.has(item.canonicalKey);
});

const createdProducts: Array<{
	canonicalKey: string;
	productId: number;
	mode: "created" | "reused_existing";
}> = [];
const skippedCreates: Array<{
	canonicalKey: string;
	reason: string;
}> = [];

for (const source of createCandidates) {
	const result = importResults.get(source.canonicalKey);
	if (!result?.enriched) {
		skippedCreates.push({
			canonicalKey: source.canonicalKey,
			reason: "Missing enriched importer result.",
		});
		continue;
	}

	const price = resolvePrice(source.price, result.enriched.calculatedPriceMnt);
	if (price == null) {
		skippedCreates.push({
			canonicalKey: source.canonicalKey,
			reason: "No usable price from extracted or calculated values.",
		});
		continue;
	}

	if (
		!result.enriched.name ||
		!result.enriched.slug ||
		result.enriched.brandId == null ||
		result.enriched.categoryId == null ||
		!result.enriched.amount ||
		!result.enriched.potency
	) {
		skippedCreates.push({
			canonicalKey: source.canonicalKey,
			reason: "Missing one or more required fields for creation.",
		});
		continue;
	}

	const existing = await db.query.ProductsTable.findFirst({
		where: and(
			isNull(ProductsTable.deletedAt),
			eq(ProductsTable.brandId, result.enriched.brandId),
			eq(
				ProductsTable.name,
				limitLength(result.enriched.name, 256) ?? result.enriched.name,
			),
			eq(
				ProductsTable.amount,
				limitLength(result.enriched.amount, 256) ?? result.enriched.amount,
			),
			eq(
				ProductsTable.potency,
				limitLength(result.enriched.potency, 256) ?? result.enriched.potency,
			),
		),
		columns: { id: true },
	});

	if (existing) {
		createdProducts.push({
			canonicalKey: source.canonicalKey,
			productId: existing.id,
			mode: "reused_existing",
		});
		continue;
	}

	try {
		const uniqueSlug = await ensureUniqueSlug(result.enriched.slug);

		let productId = 0;
		if (!options.dryRun) {
			const [created] = await db
				.insert(ProductsTable)
				.values({
					name: limitLength(result.enriched.name, 256) ?? result.enriched.name,
					slug: uniqueSlug,
					description: result.enriched.description,
					discount: 0,
					amount:
						limitLength(result.enriched.amount, 256) ?? result.enriched.amount,
					potency:
						limitLength(result.enriched.potency, 256) ??
						result.enriched.potency,
					stock: 1,
					price,
					dailyIntake: result.enriched.dailyIntake,
					categoryId: result.enriched.categoryId,
					brandId: result.enriched.brandId,
					status: "active",
					name_mn: limitLength(result.enriched.name_mn, 256),
					ingredients: result.enriched.ingredients,
					tags: [],
					seoTitle: limitLength(result.enriched.seoTitle, 256),
					seoDescription: limitLength(result.enriched.seoDescription, 512),
					weightGrams: normalizeWeightGrams(result.enriched.weightGrams),
				})
				.returning({ id: ProductsTable.id });

			productId = created?.id ?? 0;

			if (productId > 0 && result.enriched.images.length > 0) {
				await db.insert(ProductImagesTable).values(
					result.enriched.images.map((image, index) => ({
						productId,
						url: image.url,
						isPrimary: index === 0,
					})),
				);
			}
		}

		createdProducts.push({
			canonicalKey: source.canonicalKey,
			productId,
			mode: "created",
		});
	} catch (error) {
		skippedCreates.push({
			canonicalKey: source.canonicalKey,
			reason: error instanceof Error ? error.message : "Create failed.",
		});
	}
}

const extractedPriceTargets = new Map<number, number>();
for (const match of report.strongMatches) {
	const price = resolvePrice(match.extracted.price, null);
	if (price != null) extractedPriceTargets.set(match.db.id, price);
}
for (const mismatch of report.priceMismatches) {
	const price = resolvePrice(mismatch.extracted.price, null);
	if (price != null) extractedPriceTargets.set(mismatch.db.id, price);
}

const activeDbIds = new Set<number>(
	report.strongMatches.map((match) => match.db.id),
);
for (const created of createdProducts) {
	if (created.productId > 0) activeDbIds.add(created.productId);
}

for (const group of duplicateGroups) {
	const activeMember = group.find((member) => activeDbIds.has(member.id));
	if (!activeMember) continue;

	const groupPrice = extractedPriceTargets.get(activeMember.id) ?? null;
	for (const member of group) {
		activeDbIds.add(member.id);
		if (groupPrice != null) extractedPriceTargets.set(member.id, groupPrice);
	}
}

const draftDbIds = report.dbOnly
	.map((item) => item.id)
	.filter((id) => !activeDbIds.has(id));

const priceUpdates = [...extractedPriceTargets.entries()].map(
	([productId, price]) => ({
		productId,
		price,
	}),
);

if (!options.dryRun) {
	const activeIds = [...activeDbIds];
	if (activeIds.length > 0) {
		await db
			.update(ProductsTable)
			.set({
				status: "active",
				stock: sql`CASE WHEN ${ProductsTable.stock} < 1 THEN 1 ELSE ${ProductsTable.stock} END`,
			})
			.where(
				and(
					isNull(ProductsTable.deletedAt),
					inArray(ProductsTable.id, activeIds),
					or(
						ne(ProductsTable.status, "active"),
						sql`${ProductsTable.stock} < 1`,
					),
				),
			);
	}

	if (draftDbIds.length > 0) {
		await db
			.update(ProductsTable)
			.set({ status: options.deactivateStatus })
			.where(
				and(
					isNull(ProductsTable.deletedAt),
					inArray(ProductsTable.id, draftDbIds),
					ne(ProductsTable.status, options.deactivateStatus),
				),
			);
	}

	for (const update of priceUpdates) {
		await db
			.update(ProductsTable)
			.set({ price: update.price })
			.where(
				and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.id, update.productId),
					ne(ProductsTable.price, update.price),
				),
			);
	}
}

const summary: SyncSummary = {
	reportPath: options.reportPath,
	importDir: options.importDir,
	dryRun: options.dryRun,
	currentExtractedOnly: report.extractedOnly.length,
	createCandidates: createCandidates.length,
	createdCount: createdProducts.filter((item) => item.mode === "created")
		.length,
	reusedExistingCount: createdProducts.filter(
		(item) => item.mode === "reused_existing",
	).length,
	skippedCreateCount: skippedCreates.length,
	activatedCount: activeDbIds.size,
	draftedCount: draftDbIds.length,
	priceUpdatedCount: priceUpdates.length,
	activeDbIds: [...activeDbIds].sort((a, b) => a - b),
	draftDbIds: [...draftDbIds].sort((a, b) => a - b),
};

await writeJsonAtomic(
	path.join(options.outputDir, "reports", "created-products.json"),
	createdProducts,
);
await writeJsonAtomic(
	path.join(options.outputDir, "reports", "skipped-creates.json"),
	skippedCreates,
);
await writeJsonAtomic(
	path.join(options.outputDir, "reports", "active-db-ids.json"),
	[...activeDbIds].sort((a, b) => a - b),
);
await writeJsonAtomic(
	path.join(options.outputDir, "reports", "draft-db-ids.json"),
	[...draftDbIds].sort((a, b) => a - b),
);
await writeJsonAtomic(
	path.join(options.outputDir, "reports", "price-updates.json"),
	priceUpdates,
);
await writeJsonAtomic(
	path.join(options.outputDir, "reports", "summary.json"),
	summary,
);

console.log(JSON.stringify(summary, null, 2));

function parseCliArgs(args: string[]): CliOptions {
	const defaultReportPath = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/reports/rebuilt/products-vs-db.resolved.report.json",
	);
	const defaultImportDir = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/import-extracted-only-clean-dry-run",
	);
	const defaultOutputDir = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/shelf-sync-apply",
	);

	let reportPath = defaultReportPath;
	let importDir = defaultImportDir;
	let outputDir = defaultOutputDir;
	let dryRun = false;
	let deactivateStatus: "draft" | "out_of_stock" = "draft";

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--report") {
			reportPath = path.resolve(REPO_ROOT, args[++index] ?? reportPath);
		}
		if (arg === "--import-dir")
			importDir = path.resolve(REPO_ROOT, args[++index] ?? importDir);
		if (arg === "--output-dir")
			outputDir = path.resolve(REPO_ROOT, args[++index] ?? outputDir);
		if (arg === "--dry-run") dryRun = true;
		if (arg === "--deactivate-status") {
			const candidate = args[++index];
			if (candidate === "draft" || candidate === "out_of_stock") {
				deactivateStatus = candidate;
			}
		}
	}

	return {
		reportPath,
		importDir,
		outputDir,
		dryRun,
		deactivateStatus,
	};
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

function resolvePrice(
	extractedPrice: number | null,
	calculatedPrice: number | null,
): number | null {
	if (isSanePrice(extractedPrice)) return extractedPrice;
	if (isSanePrice(calculatedPrice)) return calculatedPrice;
	return null;
}

function isSanePrice(value: number | null): value is number {
	return Number.isInteger(value) && value >= 40000 && value <= 500000;
}

function normalizeWeightGrams(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return 0;
	}
	return Math.round(value);
}

function limitLength(
	value: string | null | undefined,
	max: number,
): string | null {
	if (value == null) return null;
	return value.length > max ? value.slice(0, max) : value;
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
	const normalizedBaseSlug =
		limitLength(baseSlug, 240) ?? baseSlug.slice(0, 240);
	let slug = normalizedBaseSlug;
	let attempt = 1;

	for (;;) {
		const existing = await db.query.ProductsTable.findFirst({
			where: and(isNull(ProductsTable.deletedAt), eq(ProductsTable.slug, slug)),
			columns: { id: true },
		});
		if (!existing) return slug;
		attempt += 1;
		slug = `${normalizedBaseSlug}-${attempt}`.slice(0, 256);
	}
}

async function loadImportResults(
	resultsDir: string,
): Promise<Map<string, ImportResult>> {
	const entries = await readdir(resultsDir).catch(() => []);
	const results = await Promise.all(
		entries
			.filter((entry) => entry.endsWith(".json"))
			.map(async (entry) => {
				const payload = JSON.parse(
					await readFile(path.join(resultsDir, entry), "utf8"),
				) as ImportResult;
				return [payload.canonicalKey, payload] as const;
			}),
	);
	return new Map(results);
}

async function ensureDir(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown) {
	const tempPath = `${filePath}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}
