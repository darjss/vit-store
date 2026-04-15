import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import stringSimilarity from "string-similarity";
import { z } from "zod";

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
	extracted: ExtractedProduct;
	db: DbProduct;
	score: number;
};

type DiffReport = {
	extractedOnly: ExtractedProduct[];
	dbOnly: DbProduct[];
};

const resolutionSchema = z.object({
	same: z.boolean(),
	dbId: z.number().int().nullable(),
	confidence: z.enum(["high", "medium", "low"]),
	rationale: z.string(),
});

const report = JSON.parse(
	await readFile(
		"vit/.vit-ai/reports/rebuilt/products-vs-db.report.json",
		"utf8",
	),
) as DiffReport;
const manualDecisions = JSON.parse(
	await readFile(
		"vit/.vit-ai/reports/rebuilt/manual-review-decisions.json",
		"utf8",
	),
) as Record<string, string>;

const resultsPath = path.resolve(
	"vit/.vit-ai/reports/rebuilt/ai-review-decisions.json",
);

const output: Record<
	string,
	{
		decision: "same" | "different";
		dbId?: number;
		confidence: string;
		rationale: string;
	}
> = {};

for (const extracted of report.extractedOnly) {
	const candidates = report.dbOnly
		.map((db) => ({
			extracted,
			db,
			score: candidateScore(extracted, db),
		}))
		.filter((item) => item.score >= 0.62)
		.sort((a, b) => b.score - a.score)
		.slice(0, 4);

	if (candidates.length === 0) continue;

	const decision = await resolveWithAi(extracted, candidates);
	if (!decision.same || decision.dbId === null) continue;

	const id = `extracted-${extracted.canonicalKey}`;
	output[id] = {
		decision: "same",
		dbId: decision.dbId,
		confidence: decision.confidence,
		rationale: decision.rationale,
	};
}

await writeTextAtomic(resultsPath, `${JSON.stringify(output, null, 2)}\n`);

const mergedDecisions = {
	...manualDecisions,
	...Object.fromEntries(
		Object.entries(output).map(([id, item]) => [id, item.decision]),
	),
};

await writeTextAtomic(
	"vit/.vit-ai/reports/rebuilt/manual-review-decisions.merged.json",
	`${JSON.stringify(mergedDecisions, null, 2)}\n`,
);

console.log(
	JSON.stringify(
		{
			aiMatches: Object.keys(output).length,
			resultsPath,
			mergedPath:
				"vit/.vit-ai/reports/rebuilt/manual-review-decisions.merged.json",
		},
		null,
		2,
	),
);

async function resolveWithAi(
	extracted: ExtractedProduct,
	candidates: MatchRecord[],
) {
	const firstImage = extracted.sourceImages[0];
	const imagePath = firstImage ? path.resolve("vit", firstImage) : null;
	const imageBuffer = imagePath
		? await readFile(imagePath).catch(() => null)
		: null;

	const { object } = await generateObject({
		model: google("gemini-2.5-flash"),
		schema: resolutionSchema,
		system: [
			"You are resolving whether one extracted product from a current shelf image matches one DB product.",
			"Only return same=true when it is clearly the exact same sellable product.",
			"Potency differences mean different products.",
			"Capsule/tablet/softgel/gummy count differences mean different products.",
			"Package size differences like 1 lb vs 2 lb mean different products.",
			"The DB title may be much longer and cleaner than the extracted OCR title. That alone is not a mismatch.",
			"If no candidate is exact, return same=false and dbId=null.",
		].join(" "),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: [
							"Extracted product:",
							JSON.stringify(extracted, null, 2),
							"",
							"DB candidates:",
							JSON.stringify(
								candidates.map((candidate) => ({
									id: candidate.db.id,
									brandName: candidate.db.brandName,
									name: candidate.db.name,
									amount: candidate.db.amount,
									potency: candidate.db.potency,
									price: candidate.db.price,
									status: candidate.db.status,
									score: Number(candidate.score.toFixed(3)),
								})),
								null,
								2,
							),
							"",
							"Pick the exact matching dbId or return null.",
						].join("\n"),
					},
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

	return object;
}

function candidateScore(extracted: ExtractedProduct, db: DbProduct): number {
	const extractedBrand = normalizeText(extracted.brandName);
	const extractedName = normalizeText(extracted.productName);
	const dbBrand = normalizeText(db.brandName);
	const dbName = normalizeText(db.name);

	const extractedSignals = extractSignals([
		extracted.productName,
		extracted.variant ?? "",
		extracted.sizeOrCount ?? "",
	]);
	const dbSignals = extractSignals([db.name, db.amount, db.potency]);

	if (hasConflict(extractedSignals.potency, dbSignals.potency)) return 0;
	if (hasConflict(extractedSignals.count, dbSignals.count)) return 0;
	if (hasConflict(extractedSignals.size, dbSignals.size)) return 0;

	const brandScore = exactOrSimilar(extractedBrand, dbBrand);
	const nameScore = exactOrSimilar(extractedName, dbName);
	const detailScore = compareSignals(extractedSignals, dbSignals);

	return brandScore * 0.35 + nameScore * 0.45 + detailScore * 0.2;
}

function exactOrSimilar(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) return 0.95;
	return stringSimilarity.compareTwoStrings(left, right);
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

function extractSignals(parts: string[]) {
	const text = parts.join(" ").toLowerCase();
	return {
		potency: uniqueSorted(
			Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(iu|mcg|mg|g|fu|cfu)\b/g)).map(
				(match) => `${normalizeNumber(match[1])}${match[2]}`,
			),
		),
		count: uniqueSorted(
			Array.from(
				text.matchAll(
					/\b(\d[\d,.]*)\s*(capsules|capsule|tablets|tablet|softgels|softgel|soft gels|gummies|gummy|drops|servings|count|packs|packets|chews|caps)\b/g,
				),
			).map(
				(match) => `${normalizeNumber(match[1])}${normalizeCount(match[2])}`,
			),
		),
		size: uniqueSorted(
			Array.from(text.matchAll(/\b(\d[\d,.]*)\s*(ml|fl oz|oz|lb)\b/g)).map(
				(match) =>
					`${normalizeNumber(match[1])}${match[2].replace(/\s+/g, "")}`,
			),
		),
	};
}

function compareSignals(
	left: ReturnType<typeof extractSignals>,
	right: ReturnType<typeof extractSignals>,
): number {
	return (
		compareTokenSet(left.potency, right.potency) * 0.45 +
		compareTokenSet(left.count, right.count) * 0.35 +
		compareTokenSet(left.size, right.size) * 0.2
	);
}

function compareTokenSet(left: string[], right: string[]): number {
	if (left.length === 0 && right.length === 0) return 0.75;
	if (left.length === 0 || right.length === 0) return 0.45;
	if (hasConflict(left, right)) return 0;
	const overlap = left.filter((token) => right.includes(token)).length;
	return overlap / Math.max(left.length, right.length);
}

function hasConflict(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	return !left.some((token) => right.includes(token));
}

function normalizeNumber(value: string): string {
	return value.replace(/,/g, "").replace(/\.0+$/, "");
}

function normalizeCount(value: string): string {
	const normalized = value.replace(/\s+/g, "");
	if (normalized === "caps" || normalized === "capsule") return "capsules";
	if (normalized === "tablet") return "tablets";
	if (normalized === "softgel" || normalized === "softgels") return "softgels";
	if (normalized === "gummy") return "gummies";
	return normalized;
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function getMimeType(filePath: string): string {
	if (filePath.endsWith(".png")) return "image/png";
	if (filePath.endsWith(".webp")) return "image/webp";
	return "image/jpeg";
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
