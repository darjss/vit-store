import { readFile, rename, writeFile } from "node:fs/promises";
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

const inputPath = path.resolve(
	process.argv[2] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/products.final.deduped.strict.json",
);
const outputPath = path.resolve(
	process.argv[3] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/products.final.normalized.json",
);

const brandCanonicalNames = new Map<string, string>(
	[
		["cflhtc", "Cfilihtc"],
		["cflihtc", "Cfilihtc"],
		["cfliihtc", "Cfilihtc"],
		["cnchef", "Cfilihtc"],
		["enchefd", "Cfilihtc"],
		["dr mercola", "Dr Mercola"],
		["doctor best", "Doctor's Best"],
		["doctor s best", "Doctor's Best"],
		["doctors best", "Doctor's Best"],
		["double wood", "Double Wood Supplements"],
		["double wood supplements", "Double Wood Supplements"],
		["live wise", "LiveWise Naturals"],
		["live wise naturals", "LiveWise Naturals"],
		["livewise", "LiveWise Naturals"],
		["livewise naturals", "LiveWise Naturals"],
		["mary ruth s", "MaryRuth's"],
		["maryruth", "MaryRuth's"],
		["maryruths", "MaryRuth's"],
		["micro ingredients", "Micro Ingredients"],
		["microingredients", "Micro Ingredients"],
		["nature bell", "NatureBell"],
		["naturebell", "NatureBell"],
		["new age", "NEW AGE"],
		["newage", "NEW AGE"],
		["nutri vein", "NutriVein"],
		["nutrivein", "NutriVein"],
		["nutri flair", "NutriFlair"],
		["nutriflair", "NutriFlair"],
		["now", "NOW Foods"],
		["now foods", "NOW Foods"],
	].map(([from, to]) => [normalizeText(from), to]),
);

function normalizeProduct(product: ExtractedProduct): ExtractedProduct {
	const brandName = normalizeBrandName(product.brandName);
	const productName = normalizeWhitespace(product.productName);
	const variant = normalizeNullable(product.variant);
	const sizeOrCount = normalizeSizeOrCount(product.sizeOrCount);

	return {
		...product,
		brandName,
		productName,
		variant,
		sizeOrCount,
		canonicalKey: canonicalKey({
			...product,
			brandName,
			productName,
			variant,
			sizeOrCount,
		}),
		aliases: uniqueSorted([
			...product.aliases,
			`${product.brandName} ${product.productName}`,
		]),
		sourceImages: uniqueSorted(product.sourceImages),
	};
}

function dedupeProducts(products: ExtractedProduct[]): ExtractedProduct[] {
	const byKey = new Map<string, ExtractedProduct>();

	for (const product of products) {
		const existing = byKey.get(product.canonicalKey);
		if (!existing) {
			byKey.set(product.canonicalKey, product);
			continue;
		}

		byKey.set(product.canonicalKey, mergeProducts(existing, product));
	}

	return Array.from(byKey.values()).sort((left, right) =>
		`${left.brandName} ${left.productName}`.localeCompare(
			`${right.brandName} ${right.productName}`,
		),
	);
}

function mergeProducts(
	left: ExtractedProduct,
	right: ExtractedProduct,
): ExtractedProduct {
	const preferred = choosePreferred(left, right);
	const other = preferred === left ? right : left;

	return {
		...preferred,
		price: preferred.price ?? other.price,
		priceText: preferred.priceText ?? other.priceText,
		variant: preferred.variant ?? other.variant,
		sizeOrCount: preferred.sizeOrCount ?? other.sizeOrCount,
		sourceImages: uniqueSorted([...left.sourceImages, ...right.sourceImages]),
		aliases: uniqueSorted([
			...left.aliases,
			...right.aliases,
			`${left.brandName} ${left.productName}`,
			`${right.brandName} ${right.productName}`,
		]),
		confidence: Math.max(left.confidence, right.confidence),
	};
}

function choosePreferred(
	left: ExtractedProduct,
	right: ExtractedProduct,
): ExtractedProduct {
	if (left.price !== null && right.price === null) return left;
	if (right.price !== null && left.price === null) return right;
	if (right.confidence !== left.confidence) {
		return right.confidence > left.confidence ? right : left;
	}
	return displayLength(right) > displayLength(left) ? right : left;
}

function displayLength(product: ExtractedProduct): number {
	return [
		product.brandName,
		product.productName,
		product.variant,
		product.sizeOrCount,
	]
		.filter(Boolean)
		.join(" ").length;
}

function normalizeBrandName(value: string): string {
	const normalized = normalizeText(value);
	const canonical = brandCanonicalNames.get(normalized);
	if (canonical) return canonical;
	return normalizeWhitespace(value);
}

function normalizeSizeOrCount(value: string | null): string | null {
	const normalized = normalizeNullable(value);
	if (!normalized) return null;

	return normalized
		.replace(/\bsoft gels\b/gi, "softgels")
		.replace(/\bsoft gel\b/gi, "softgel")
		.replace(/\bveggie caps\b/gi, "capsules")
		.replace(/\bveg capsules\b/gi, "capsules")
		.replace(/\bcaps\b/gi, "capsules")
		.replace(/\bfl\.?\s*oz\b/gi, "fl oz")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeNullable(value: string | null): string | null {
	if (!value) return null;
	const normalized = normalizeWhitespace(value);
	if (!normalized || normalized.toLowerCase() === "null") return null;
	return normalized;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function canonicalKey(product: ExtractedProduct): string {
	return [
		product.brandName,
		product.productName,
		product.variant ?? "",
		product.sizeOrCount ?? "",
	]
		.map(normalizeText)
		.filter(Boolean)
		.join("|");
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(
			/\b(the|and|with|supplement|supplements|dietary|capsules|capsule|tablets|tablet|gummies|gummy|liquid|drops|softgels|softgel)\b/g,
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
		left.localeCompare(right),
	);
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}

const products = JSON.parse(await readFile(inputPath, "utf8")) as ExtractedProduct[];
const normalized = dedupeProducts(products.map(normalizeProduct));

await writeTextAtomic(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

console.log(
	JSON.stringify(
		{
			inputPath,
			outputPath,
			inputProducts: products.length,
			outputProducts: normalized.length,
			removedDuplicates: products.length - normalized.length,
		},
		null,
		2,
	),
);
