import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import postgres from "postgres";
import stringSimilarity from "string-similarity";

loadDotEnv({ path: ".env" });

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

type DbProduct = {
	id: number;
	name: string;
	price: number;
	amount: string;
	potency: string;
	status: string;
	stock: number;
	slug: string;
	brandName: string;
	categoryName: string;
};

type MatchRecord = {
	matchType: "strong" | "possible";
	score: number;
	scoreBreakdown: {
		brandScore: number;
		nameScore: number;
		detailScore: number;
		priceScore: number;
	};
	extracted: ExtractedProduct;
	db: DbProduct;
	priceDelta: number | null;
};

type DiffReport = {
	generatedAt: string;
	extractedCount: number;
	dbCount: number;
	strongMatches: MatchRecord[];
	possibleMatches: MatchRecord[];
	extractedOnly: ExtractedProduct[];
	dbOnly: DbProduct[];
	priceMismatches: MatchRecord[];
};

type NearExisting = {
	extracted: ExtractedProduct;
	db: DbProduct;
	score: number;
	reasons: string[];
};

const reportPath = path.resolve(
	process.argv[2] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/normalized/products-vs-db.report.json",
);
const outputDir = path.resolve(
	process.argv[3] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/normalized/review",
);
const applyPriceUpdates = process.argv.includes("--apply-price-updates");

const brandAliases = new Map<string, string>(
	[
		["cflhtc", "cfilihtc"],
		["cflihtc", "cfilihtc"],
		["cfliihtc", "cfilihtc"],
		["cnchef", "cfilihtc"],
		["enchefd", "cfilihtc"],
		["doctor best", "doctors best"],
		["doctor s best", "doctors best"],
		["doctors best", "doctors best"],
		["double wood supplements", "double wood"],
		["double wood", "double wood"],
		["dr mercola", "mercola"],
		["live wise naturals", "livewise naturals"],
		["live wise", "livewise naturals"],
		["livewise", "livewise naturals"],
		["livewise naturals", "livewise naturals"],
		["mary ruth s", "maryruths"],
		["maryruth", "maryruths"],
		["maryruths", "maryruths"],
		["microingredients", "micro ingredients"],
		["micro ingredients", "micro ingredients"],
		["nature bell", "naturebell"],
		["naturebell", "naturebell"],
		["newage", "new age"],
		["new age", "new age"],
		["nutri vein", "nutrivein"],
		["nutrivein", "nutrivein"],
		["nutri flair", "nutriflair"],
		["nutriflair", "nutriflair"],
		["now", "now foods"],
		["now foods", "now foods"],
	].map(([from, to]) => [normalizeText(from), normalizeText(to)]),
);

await mkdir(outputDir, { recursive: true });

const report = JSON.parse(await readFile(reportPath, "utf8")) as DiffReport;
const dbUrl = getDbUrl();
const sql = postgres(dbUrl, { ssl: "require", max: 1, fetch_types: false });

try {
	const dbProducts = await loadDbProducts(sql);
	const highConfidencePriceUpdates = report.priceMismatches.filter(
		isHighConfidencePriceUpdate,
	);
	const highConfidenceIds = new Set(
		highConfidencePriceUpdates.map((match) => match.db.id),
	);
	const priceUpdateReview = [
		...report.priceMismatches.filter(
			(match) => !highConfidenceIds.has(match.db.id),
		),
		...report.possibleMatches.filter(
			(match) =>
				match.extracted.price !== null &&
				(match.priceDelta ?? 0) >= 5_000 &&
				match.score >= 0.84,
		),
	].sort(sortMatches);
	const nearExisting = report.extractedOnly
		.map((extracted) => findNearExisting(extracted, dbProducts))
		.filter((match): match is NearExisting => match !== null)
		.sort((left, right) => right.score - left.score);
	const nearExistingKeys = new Set(
		nearExisting.map((match) => match.extracted.canonicalKey),
	);
	const addCandidates = report.extractedOnly
		.filter(
			(product) =>
				product.price !== null &&
				product.confidence >= 0.95 &&
				!nearExistingKeys.has(product.canonicalKey),
		)
		.sort(sortExtracted);
	const addReview = report.extractedOnly
		.filter(
			(product) =>
				product.price === null ||
				product.confidence < 0.95 ||
				nearExistingKeys.has(product.canonicalKey),
		)
		.sort(sortExtracted);

	const review = {
		generatedAt: new Date().toISOString(),
		reportPath,
		dbScope: "all non-deleted products, including active and draft",
		counts: {
			extracted: report.extractedCount,
			db: report.dbCount,
			strongMatches: report.strongMatches.length,
			possibleMatches: report.possibleMatches.length,
			extractedOnly: report.extractedOnly.length,
			highConfidencePriceUpdates: highConfidencePriceUpdates.length,
			priceUpdateReview: priceUpdateReview.length,
			addCandidates: addCandidates.length,
			nearExistingReview: nearExisting.length,
			addReview: addReview.length,
		},
		highConfidencePriceUpdates,
		priceUpdateReview,
		addCandidates,
		nearExistingReview: nearExisting,
		addReview,
	};

	await writeTextAtomic(
		path.join(outputDir, "manual-candidates.normalized.json"),
		`${JSON.stringify(review, null, 2)}\n`,
	);
	await writeTextAtomic(
		path.join(outputDir, "manual-candidates.normalized.md"),
		buildMarkdown(review),
	);

	if (applyPriceUpdates) {
		await applyUpdates(sql, highConfidencePriceUpdates, outputDir);
	}

	console.log(JSON.stringify(review.counts, null, 2));
} finally {
	await sql.end({ timeout: 5 });
}

function isHighConfidencePriceUpdate(match: MatchRecord): boolean {
	return (
		match.score >= 0.92 &&
		match.scoreBreakdown.brandScore >= 0.94 &&
		match.scoreBreakdown.nameScore >= 0.9 &&
		match.scoreBreakdown.detailScore >= 0.75 &&
		match.extracted.confidence >= 0.95 &&
		match.extracted.price !== null
	);
}

function findNearExisting(
	extracted: ExtractedProduct,
	dbProducts: DbProduct[],
): NearExisting | null {
	const extractedBrand = normalizeBrand(extracted.brandName);
	const extractedTokens = tokenSet([
		extracted.productName,
		extracted.variant ?? "",
		extracted.sizeOrCount ?? "",
	]);
	let best: NearExisting | null = null;

	for (const db of dbProducts) {
		const dbBrand = normalizeBrand(db.brandName);
		const brandScore = exactOrSimilar(extractedBrand, dbBrand);
		if (brandScore < 0.9) continue;

		const dbTokens = tokenSet([db.name, db.amount, db.potency]);
		const overlap = jaccard(extractedTokens, dbTokens);
		const nameScore = exactOrSimilar(
			normalizeText(extracted.productName),
			normalizeText(db.name),
		);
		const score = brandScore * 0.3 + Math.max(overlap, nameScore) * 0.7;
		if (score < 0.58) continue;

		const reasons = [
			`brand=${round(brandScore)}`,
			`tokenOverlap=${round(overlap)}`,
			`name=${round(nameScore)}`,
			`dbStatus=${db.status}`,
		];
		if (!best || score > best.score) best = { extracted, db, score, reasons };
	}

	return best;
}

async function applyUpdates(
	sql: postgres.Sql,
	matches: MatchRecord[],
	outputDir: string,
): Promise<void> {
	const updates = matches.map((match) => ({
		productId: match.db.id,
		status: match.db.status,
		brandName: match.db.brandName,
		name: match.db.name,
		oldPrice: match.db.price,
		newPrice: match.extracted.price,
		sourceImages: match.extracted.sourceImages,
		score: match.score,
	}));
	const auditPath = path.join(
		outputDir,
		`price-updates.applied.${new Date()
			.toISOString()
			.replace(/[:.]/g, "-")}.json`,
	);
	await writeTextAtomic(auditPath, `${JSON.stringify(updates, null, 2)}\n`);

	await sql.begin(async (tx) => {
		for (const update of updates) {
			await tx`
				update ecom_vit_product
				set price = ${update.newPrice}, updated_at = now()
				where id = ${update.productId}
					and deleted_at is null
					and price = ${update.oldPrice}
			`;
		}
	});
}

async function loadDbProducts(sql: postgres.Sql): Promise<DbProduct[]> {
	return sql<DbProduct[]>`
		select
			p.id,
			p.name,
			p.slug,
			p.price,
			p.amount,
			p.potency,
			p.status,
			p.stock,
			coalesce(b.name, '') as "brandName",
			coalesce(c.name, '') as "categoryName"
		from ecom_vit_product p
		left join ecom_vit_brand b on b.id = p.brand_id
		left join ecom_vit_category c on c.id = p.category_id
		where p.deleted_at is null
		order by p.updated_at desc nulls last, p.created_at desc, p.id desc
	`;
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

function normalizeBrand(value: string): string {
	const normalized = normalizeText(value);
	return brandAliases.get(normalized) ?? normalized;
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|supplement|supplements|dietary|capsules|capsule|tablets|tablet|gummies|gummy|liquid|drops|softgels|softgel|serving|servings|per|made|natural|formula)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function tokenSet(parts: string[]): Set<string> {
	return new Set(
		normalizeText(parts.join(" "))
			.split(" ")
			.filter((token) => token.length > 2 && !/^\d+$/.test(token)),
	);
}

function jaccard(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 || right.size === 0) return 0;
	let overlap = 0;
	for (const token of left) {
		if (right.has(token)) overlap++;
	}
	return overlap / Math.max(left.size, right.size);
}

function exactOrSimilar(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) return 0.94;
	return stringSimilarity.compareTwoStrings(left, right);
}

function sortMatches(left: MatchRecord, right: MatchRecord): number {
	return (right.priceDelta ?? 0) - (left.priceDelta ?? 0);
}

function sortExtracted(
	left: ExtractedProduct,
	right: ExtractedProduct,
): number {
	return `${left.brandName} ${left.productName}`.localeCompare(
		`${right.brandName} ${right.productName}`,
	);
}

function buildMarkdown(review: {
	generatedAt: string;
	reportPath: string;
	dbScope: string;
	counts: Record<string, number>;
	highConfidencePriceUpdates: MatchRecord[];
	priceUpdateReview: MatchRecord[];
	addCandidates: ExtractedProduct[];
	nearExistingReview: NearExisting[];
	addReview: ExtractedProduct[];
}): string {
	const lines = [
		"# Normalized VIT Product Review",
		"",
		`Generated: ${review.generatedAt}`,
		`DB scope: ${review.dbScope}`,
		"",
		"## Counts",
		"",
		...Object.entries(review.counts).map(([key, value]) => `- ${key}: ${value}`),
		"",
		"## High Confidence Price Updates",
		"",
		...renderPriceUpdates(review.highConfidencePriceUpdates),
		"",
		"## Price Updates To Review",
		"",
		...renderPriceUpdates(review.priceUpdateReview),
		"",
		"## Add Candidates",
		"",
		...renderExtracted(review.addCandidates),
		"",
		"## Near Existing Review Before Add",
		"",
		...renderNearExisting(review.nearExistingReview),
		"",
		"## Low Confidence Or Missing Price Review",
		"",
		...renderExtracted(review.addReview),
		"",
	];

	return `${lines.join("\n")}\n`;
}

function renderPriceUpdates(matches: MatchRecord[]): string[] {
	if (matches.length === 0) return ["None."];
	return matches.map(
		(match) =>
			`- dbId=${match.db.id} ${match.db.status} | ${match.db.brandName} ${match.db.name} | ${formatPrice(match.db.price)} -> ${formatPrice(match.extracted.price)} | score=${round(match.score)} | image=${match.extracted.sourceImages[0]}`,
	);
}

function renderExtracted(products: ExtractedProduct[]): string[] {
	if (products.length === 0) return ["None."];
	return products.map(
		(product) =>
			`- ${product.brandName} ${product.productName}${product.variant ? ` | ${product.variant}` : ""}${product.sizeOrCount ? ` | ${product.sizeOrCount}` : ""} | price=${formatPrice(product.price)} | confidence=${round(product.confidence)} | image=${product.sourceImages[0]}`,
	);
}

function renderNearExisting(matches: NearExisting[]): string[] {
	if (matches.length === 0) return ["None."];
	return matches.map(
		(match) =>
			`- extracted=${match.extracted.brandName} ${match.extracted.productName} | price=${formatPrice(match.extracted.price)} | possibleDb=${match.db.id} ${match.db.status} ${match.db.brandName} ${match.db.name} | dbPrice=${formatPrice(match.db.price)} | score=${round(match.score)} | ${match.reasons.join(", ")} | image=${match.extracted.sourceImages[0]}`,
	);
}

function formatPrice(value: number | null): string {
	if (value === null) return "null";
	return value.toLocaleString("en-US");
}

function round(value: number): number {
	return Number.parseFloat(value.toFixed(3));
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
