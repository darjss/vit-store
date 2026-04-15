import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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
	slug: string;
	price: number;
	amount: string;
	potency: string;
	status: string;
	stock: number;
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
	reviewedDifferent?: ReviewItem[];
};

type ReviewDecision = "same" | "different" | "needs-review";

type ReviewItem =
	| {
			id: string;
			kind: "possible" | "priceMismatches";
			match: MatchRecord;
	  }
	| {
			id: string;
			kind: "extractedOnly";
			extracted: ExtractedProduct;
	  }
	| {
			id: string;
			kind: "dbOnly";
			db: DbProduct;
	  };

type ManualMatchOverride = {
	extractedCanonicalKey: string;
	dbId: number;
	reason: string;
};

const inputReportPath = path.resolve(
	process.argv[2] ?? "vit/.vit-ai/reports/rebuilt/products-vs-db.report.json",
);
const decisionsPath = path.resolve(
	process.argv[3] ?? "vit/.vit-ai/reports/rebuilt/manual-review-decisions.json",
);
const overridesPath = path.resolve(
	process.argv[4] ?? "vit/.vit-ai/reports/rebuilt/manual-match-overrides.json",
);
const outputPath = path.resolve(
	process.argv[5] ??
		"vit/.vit-ai/reports/rebuilt/products-vs-db.resolved.report.json",
);

await mkdir(path.dirname(outputPath), { recursive: true });

const report = JSON.parse(
	await readFile(inputReportPath, "utf8"),
) as DiffReport;
const decisions = JSON.parse(await readFile(decisionsPath, "utf8")) as Record<
	string,
	ReviewDecision
>;
const overrides = JSON.parse(
	await readFile(overridesPath, "utf8"),
) as ManualMatchOverride[];

const strongMatches = [...report.strongMatches];
const possibleMatches: MatchRecord[] = [];
const consumedExtractedKeys = new Set(
	strongMatches.map((match) => match.extracted.canonicalKey),
);
const consumedDbIds = new Set(strongMatches.map((match) => match.db.id));
const reviewedDifferent: ReviewItem[] = [];

for (const match of report.possibleMatches) {
	const id = `possible-${match.db.id}-${match.extracted.canonicalKey}`;
	const decision = decisions[id];

	if (decision === "same") {
		strongMatches.push({ ...match, matchType: "strong" });
		consumedExtractedKeys.add(match.extracted.canonicalKey);
		consumedDbIds.add(match.db.id);
		continue;
	}

	if (decision === "different") {
		reviewedDifferent.push({
			id,
			kind: "possible",
			match,
		});
		continue;
	}

	possibleMatches.push(match);
}

for (const override of overrides) {
	if (consumedExtractedKeys.has(override.extractedCanonicalKey)) continue;
	if (consumedDbIds.has(override.dbId)) continue;

	const extracted = report.extractedOnly.find(
		(item) => item.canonicalKey === override.extractedCanonicalKey,
	);
	const db = report.dbOnly.find((item) => item.id === override.dbId);

	if (!extracted || !db) continue;

	strongMatches.push({
		matchType: "strong",
		score: 0.999,
		scoreBreakdown: {
			brandScore: 1,
			nameScore: 1,
			detailScore: 1,
			priceScore:
				extracted.price !== null && extracted.price === db.price ? 1 : 0.8,
		},
		extracted,
		db,
		priceDelta:
			extracted.price !== null ? Math.abs(extracted.price - db.price) : null,
	});
	consumedExtractedKeys.add(extracted.canonicalKey);
	consumedDbIds.add(db.id);
}

for (const extracted of report.extractedOnly) {
	const id = `extracted-${extracted.canonicalKey}`;
	if (consumedExtractedKeys.has(extracted.canonicalKey)) continue;
	if (decisions[id] === "different") {
		reviewedDifferent.push({
			id,
			kind: "extractedOnly",
			extracted,
		});
	}
}

for (const db of report.dbOnly) {
	const id = `db-${db.id}`;
	if (consumedDbIds.has(db.id)) continue;
	if (decisions[id] === "different") {
		reviewedDifferent.push({
			id,
			kind: "dbOnly",
			db,
		});
	}
}

const extractedOnly = report.extractedOnly.filter(
	(item) =>
		!consumedExtractedKeys.has(item.canonicalKey) &&
		decisions[`extracted-${item.canonicalKey}`] !== "different",
);
const dbOnly = report.dbOnly.filter(
	(item) =>
		!consumedDbIds.has(item.id) && decisions[`db-${item.id}`] !== "different",
);
const priceMismatches = strongMatches.filter(
	(match) =>
		match.extracted.price !== null &&
		Math.abs(match.extracted.price - match.db.price) >= 5_000,
);

const resolvedReport: DiffReport = {
	...report,
	generatedAt: new Date().toISOString(),
	strongMatches: strongMatches.sort(sortMatches),
	possibleMatches: possibleMatches.sort(sortMatches),
	extractedOnly: extractedOnly.sort(sortExtracted),
	dbOnly: dbOnly.sort(sortDb),
	priceMismatches: priceMismatches.sort(
		(a, b) => (b.priceDelta ?? 0) - (a.priceDelta ?? 0),
	),
	reviewedDifferent: reviewedDifferent.sort((left, right) =>
		left.id.localeCompare(right.id),
	),
};

await writeTextAtomic(
	outputPath,
	`${JSON.stringify(resolvedReport, null, 2)}\n`,
);

console.log(
	JSON.stringify(
		{
			outputPath,
			strongMatches: resolvedReport.strongMatches.length,
			possibleMatches: resolvedReport.possibleMatches.length,
			extractedOnly: resolvedReport.extractedOnly.length,
			dbOnly: resolvedReport.dbOnly.length,
			priceMismatches: resolvedReport.priceMismatches.length,
			reviewedDifferent: resolvedReport.reviewedDifferent?.length ?? 0,
		},
		null,
		2,
	),
);

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

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
