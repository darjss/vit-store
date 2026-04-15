import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type ExtractedProduct = {
	brandName: string;
	productName: string;
	priceText: string | null;
	priceValue: number | null;
	variant: string | null;
	sizeOrCount: string | null;
	confidence: number;
	reasoning: string;
};

type ExtractionResultFile = {
	imageId: string;
	currentName: string;
	extraction: {
		imageSummary: string;
		products: ExtractedProduct[];
	};
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

const resultsDir = path.resolve(process.argv[2] ?? "vit/.vit-ai/results");
const outputDir = path.resolve(process.argv[3] ?? "vit/.vit-ai/reports");
const outputPath = path.join(outputDir, "products.final.rebuilt.json");
const manualMergeOverridesPath = path.resolve(
	process.argv[4] ??
		"vit/.vit-ai/reports/rebuilt/extracted-merge-overrides.json",
);

await mkdir(outputDir, { recursive: true });

const files = (await readdir(resultsDir))
	.filter((file) => file.endsWith(".json"))
	.sort((a, b) => a.localeCompare(b));

const results = await Promise.all(
	files.map(async (file) => {
		const text = await readFile(path.join(resultsDir, file), "utf8");
		return JSON.parse(text) as ExtractionResultFile;
	}),
);

const manualMergeOverrides = await loadManualMergeOverrides(
	manualMergeOverridesPath,
);

const grouped = new Map<
	string,
	{
		best: ExtractedProduct;
		sourceImages: Set<string>;
		aliases: Set<string>;
		prices: Map<number | null, number>;
	}
>();

for (const result of results) {
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

const dedupedProducts: FinalProduct[] = Array.from(grouped.entries())
	.map(([canonicalKey, group]) => {
		const price = selectMostCommonPrice(group.prices, group.best.priceValue);
		return {
			brandName: group.best.brandName,
			productName: group.best.productName,
			price,
			priceText: price === group.best.priceValue ? group.best.priceText : null,
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

const finalProducts = applyManualMergeOverrides(
	consolidateNearDuplicates(dedupedProducts),
	manualMergeOverrides,
);

await writeTextAtomic(
	outputPath,
	`${JSON.stringify(finalProducts, null, 2)}\n`,
);

console.log(
	JSON.stringify(
		{
			results: results.length,
			finalProducts: finalProducts.length,
			outputPath,
		},
		null,
		2,
	),
);

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

function isBetterProductCandidate(
	next: ExtractedProduct,
	current: ExtractedProduct,
): boolean {
	if (next.confidence !== current.confidence) {
		return next.confidence > current.confidence;
	}

	return textRichness(next) > textRichness(current);
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

function consolidateNearDuplicates(products: FinalProduct[]): FinalProduct[] {
	const groupedByDetail = new Map<string, FinalProduct[]>();

	for (const product of products) {
		const detailSignals = extractDetailSignals([
			product.productName,
			product.variant ?? "",
			product.sizeOrCount ?? "",
		]);
		const groupKey = [
			normalizeKeyPart(product.brandName),
			detailSignals.potencyKey,
			detailSignals.countKey,
			detailSignals.sizeKey,
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

	return consolidated.sort((a, b) =>
		`${a.brandName} ${a.productName}`.localeCompare(
			`${b.brandName} ${b.productName}`,
		),
	);
}

function applyManualMergeOverrides(
	products: FinalProduct[],
	overrides: ManualMergeOverride[],
): FinalProduct[] {
	if (overrides.length === 0) return products;

	let nextProducts = [...products];

	for (const override of overrides) {
		const matches = nextProducts.filter((product) =>
			override.canonicalKeys.includes(product.canonicalKey),
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

	return nextProducts.sort((a, b) =>
		`${a.brandName} ${a.productName}`.localeCompare(
			`${b.brandName} ${b.productName}`,
		),
	);
}

function shouldMergeProducts(left: FinalProduct, right: FinalProduct): boolean {
	if (normalizeKeyPart(left.brandName) !== normalizeKeyPart(right.brandName)) {
		return false;
	}

	const leftName = normalizeComparableName(left);
	const rightName = normalizeComparableName(right);

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

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

async function loadManualMergeOverrides(
	filePath: string,
): Promise<ManualMergeOverride[]> {
	try {
		return JSON.parse(
			await readFile(filePath, "utf8"),
		) as ManualMergeOverride[];
	} catch {
		return [];
	}
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
