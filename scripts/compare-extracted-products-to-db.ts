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

const extractedPath = path.resolve(
	process.argv[2] ?? "vit/.vit-ai/reports/products.final.json",
);
const outputDir = path.resolve(process.argv[3] ?? "vit/.vit-ai/reports");
const reportJsonPath = path.join(outputDir, "products-vs-db.report.json");
const reportMarkdownPath = path.join(outputDir, "products-vs-db.report.md");

await mkdir(outputDir, { recursive: true });

const extractedProducts = (
	JSON.parse(await readFile(extractedPath, "utf8")) as ExtractedProduct[]
).sort((a, b) =>
	`${a.brandName} ${a.productName}`.localeCompare(
		`${b.brandName} ${b.productName}`,
	),
);

const dbUrl = getDbUrl();
const sql = postgres(dbUrl, { ssl: "require", max: 1, fetch_types: false });

try {
	const dbProducts = await loadDbProducts(sql);
	const report = buildDiffReport(extractedProducts, dbProducts);

	await writeTextAtomic(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
	await writeTextAtomic(reportMarkdownPath, buildMarkdownReport(report));

	console.log(
		JSON.stringify(
			{
				extractedCount: report.extractedCount,
				dbCount: report.dbCount,
				strongMatches: report.strongMatches.length,
				possibleMatches: report.possibleMatches.length,
				extractedOnly: report.extractedOnly.length,
				dbOnly: report.dbOnly.length,
				priceMismatches: report.priceMismatches.length,
				reportJsonPath,
				reportMarkdownPath,
			},
			null,
			2,
		),
	);
} finally {
	await sql.end({ timeout: 5 });
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

function buildDiffReport(
	extractedProducts: ExtractedProduct[],
	dbProducts: DbProduct[],
): DiffReport {
	const strongMatches: MatchRecord[] = [];
	const possibleMatches: MatchRecord[] = [];
	const extractedOnly: ExtractedProduct[] = [];
	const consumedDbIds = new Set<number>();

	for (const extracted of extractedProducts) {
		const candidates = dbProducts
			.map((db) => scoreCandidate(extracted, db))
			.sort((a, b) => b.score - a.score);
		const best = candidates[0];

		if (!best || best.score < 0.72) {
			extractedOnly.push(extracted);
			continue;
		}

		const matchRecord: MatchRecord = {
			matchType: best.score >= 0.88 ? "strong" : "possible",
			score: best.score,
			scoreBreakdown: best.scoreBreakdown,
			extracted,
			db: best.db,
			priceDelta:
				extracted.price !== null
					? Math.abs((extracted.price ?? 0) - best.db.price)
					: null,
		};

		if (matchRecord.matchType === "strong") {
			if (consumedDbIds.has(best.db.id)) {
				possibleMatches.push({ ...matchRecord, matchType: "possible" });
				continue;
			}

			consumedDbIds.add(best.db.id);
			strongMatches.push(matchRecord);
			continue;
		}

		possibleMatches.push(matchRecord);
	}

	const dbOnly = dbProducts.filter((product) => !consumedDbIds.has(product.id));
	const priceMismatches = strongMatches.filter(
		(match) =>
			match.extracted.price !== null &&
			Math.abs(match.extracted.price - match.db.price) >= 5_000,
	);

	return {
		generatedAt: new Date().toISOString(),
		extractedCount: extractedProducts.length,
		dbCount: dbProducts.length,
		strongMatches: strongMatches.sort(sortMatches),
		possibleMatches: possibleMatches.sort(sortMatches),
		extractedOnly: extractedOnly.sort(sortExtracted),
		dbOnly: dbOnly.sort(sortDb),
		priceMismatches: priceMismatches.sort(
			(a, b) => (b.priceDelta ?? 0) - (a.priceDelta ?? 0),
		),
	};
}

function scoreCandidate(extracted: ExtractedProduct, db: DbProduct) {
	const extractedBrand = normalizeText(extracted.brandName);
	const extractedName = normalizeText(extracted.productName);
	const extractedDetail = normalizeText(
		[extracted.variant, extracted.sizeOrCount].filter(Boolean).join(" "),
	);
	const extractedSignals = extractDetailSignals([
		extracted.productName,
		extracted.variant ?? "",
		extracted.sizeOrCount ?? "",
	]);

	const dbBrand = normalizeText(db.brandName);
	const dbName = normalizeText(db.name);
	const dbDetail = normalizeText(
		[db.name, db.amount, db.potency].filter(Boolean).join(" "),
	);
	const dbSignals = extractDetailSignals([db.name, db.amount, db.potency]);

	const brandScore = exactOrSimilar(extractedBrand, dbBrand);
	const nameScore = exactOrSimilar(extractedName, dbName);
	const detailScore = scoreDetailSignals(extractedSignals, dbSignals);
	const priceScore = comparePrice(extracted.price, db.price);
	const potencyConflict = hasConflict(
		extractedSignals.potencyTokens,
		dbSignals.potencyTokens,
	);
	const countConflict = hasConflict(
		extractedSignals.countTokens,
		dbSignals.countTokens,
	);
	const sizeConflict = hasConflict(
		extractedSignals.sizeTokens,
		dbSignals.sizeTokens,
	);

	let score =
		brandScore * 0.35 + nameScore * 0.4 + detailScore * 0.15 + priceScore * 0.1;

	if (brandScore < 0.45) score -= 0.2;
	if (nameScore < 0.45) score -= 0.25;
	if (potencyConflict) score -= 0.35;
	if (countConflict) score -= 0.35;
	if (sizeConflict) score -= 0.15;
	if (!extractedDetail && !dbDetail) score += 0.02;

	return {
		db,
		score,
		scoreBreakdown: {
			brandScore: round(brandScore),
			nameScore: round(nameScore),
			detailScore: round(detailScore),
			priceScore: round(priceScore),
		},
	};
}

function exactOrSimilar(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) return 0.94;
	return stringSimilarity.compareTwoStrings(left, right);
}

type DetailSignals = {
	potencyTokens: string[];
	countTokens: string[];
	sizeTokens: string[];
};

function extractDetailSignals(parts: string[]): DetailSignals {
	const text = parts.join(" ").toLowerCase();

	const potencyTokens = uniqueSorted(
		Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(iu|mcg|mg|g|fu|cfu)\b/g)).map(
			(match) => `${normalizeNumberToken(match[1])}${match[2]}`,
		),
	);
	const countTokens = uniqueSorted(
		Array.from(
			text.matchAll(
				/\b(\d[\d,.]*)\s*(capsules|capsule|tablets|tablet|softgels|softgel|soft gels|gummies|gummy|drops|servings|count|packs|packets|chews|caps)\b/g,
			),
		).map(
			(match) =>
				`${normalizeNumberToken(match[1])}${normalizeCountUnit(match[2])}`,
		),
	);
	const sizeTokens = uniqueSorted(
		Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(ml|fl oz|oz|lb)\b/g)).map(
			(match) =>
				`${normalizeNumberToken(match[1])}${match[2].replace(/\s+/g, "")}`,
		),
	);

	return {
		potencyTokens,
		countTokens,
		sizeTokens,
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
	if (
		left.every((token) => right.includes(token)) ||
		right.every((token) => left.includes(token))
	) {
		return 1;
	}

	const overlap = left.filter((token) => right.includes(token)).length;
	return overlap / Math.max(left.length, right.length);
}

function hasConflict(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	return !left.some((token) => right.includes(token));
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

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|supplement|dietary|capsules|capsule|tablets|tablet|gummies|gummy|liquid|drops|softgels|softgel)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function round(value: number): number {
	return Number.parseFloat(value.toFixed(3));
}

function sortExtracted(a: ExtractedProduct, b: ExtractedProduct): number {
	return `${a.brandName} ${a.productName}`.localeCompare(
		`${b.brandName} ${b.productName}`,
	);
}

function sortDb(a: DbProduct, b: DbProduct): number {
	return `${a.brandName} ${a.name}`.localeCompare(`${b.brandName} ${b.name}`);
}

function sortMatches(a: MatchRecord, b: MatchRecord): number {
	if (b.score !== a.score) return b.score - a.score;
	return sortExtracted(a.extracted, b.extracted);
}

function buildMarkdownReport(report: DiffReport): string {
	const lines: string[] = [
		"# Extracted Products vs DB",
		"",
		`Generated: ${report.generatedAt}`,
		"",
		"## Summary",
		"",
		`- Extracted products: ${report.extractedCount}`,
		`- DB products: ${report.dbCount}`,
		`- Strong matches: ${report.strongMatches.length}`,
		`- Possible matches: ${report.possibleMatches.length}`,
		`- Extracted only: ${report.extractedOnly.length}`,
		`- DB only: ${report.dbOnly.length}`,
		`- Price mismatches: ${report.priceMismatches.length}`,
		"",
		"## Price Mismatches",
		"",
		...renderPriceMismatches(report.priceMismatches.slice(0, 50)),
		"",
		"## Extracted Only",
		"",
		...renderExtractedOnly(report.extractedOnly.slice(0, 100)),
		"",
		"## DB Only",
		"",
		...renderDbOnly(report.dbOnly.slice(0, 100)),
		"",
		"## Possible Matches",
		"",
		...renderPossibleMatches(report.possibleMatches.slice(0, 100)),
		"",
	];

	return `${lines.join("\n")}\n`;
}

function renderPriceMismatches(matches: MatchRecord[]): string[] {
	if (matches.length === 0) return ["No strong-match price mismatches found."];

	return matches.map(
		(match) =>
			`- ${formatExtracted(match.extracted)} | extracted=${formatPrice(match.extracted.price)} db=${formatPrice(match.db.price)} delta=${formatPrice(match.priceDelta)}`,
	);
}

function renderExtractedOnly(items: ExtractedProduct[]): string[] {
	if (items.length === 0) return ["No extracted-only products."];

	return items.map(
		(item) =>
			`- ${formatExtracted(item)} | price=${formatPrice(item.price)} | images=${item.sourceImages.length}`,
	);
}

function renderDbOnly(items: DbProduct[]): string[] {
	if (items.length === 0) return ["No db-only products."];

	return items.map(
		(item) =>
			`- ${item.brandName} ${item.name} | price=${formatPrice(item.price)} | id=${item.id} | status=${item.status}`,
	);
}

function renderPossibleMatches(matches: MatchRecord[]): string[] {
	if (matches.length === 0) return ["No possible matches."];

	return matches.map(
		(match) =>
			`- score=${match.score} | extracted=${formatExtracted(match.extracted)} | db=${match.db.brandName} ${match.db.name} | dbId=${match.db.id}`,
	);
}

function formatExtracted(item: ExtractedProduct): string {
	return [item.brandName, item.productName, item.variant, item.sizeOrCount]
		.filter(Boolean)
		.join(" | ");
}

function formatPrice(value: number | null): string {
	if (value === null) return "null";
	return value.toLocaleString("en-US");
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
