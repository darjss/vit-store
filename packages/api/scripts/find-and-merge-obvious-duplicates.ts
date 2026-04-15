import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { compareTwoStrings } from "string-similarity";
import {
	BrandsTable,
	ProductImagesTable,
	ProductsTable,
} from "../src/db/schema";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const STOP_WORDS = new Set([
	"with",
	"for",
	"and",
	"the",
	"from",
	"sugar",
	"free",
	"supplement",
	"supports",
	"support",
	"daily",
	"nutrition",
	"women",
	"men",
	"vegan",
	"gluten",
	"raspberry",
	"calm",
	"mood",
	"sleep",
	"organic",
	"usda",
	"superfood",
	"high",
	"fiber",
	"antioxidants",
]);

loadDotEnv({ path: path.resolve(REPO_ROOT, ".env") });
loadDotEnv({
	path: path.resolve(import.meta.dir, "../../.env"),
	override: false,
});

type ProductRow = {
	id: number;
	name: string;
	slug: string;
	amount: string;
	potency: string;
	price: number;
	status: string;
	brandName: string;
	imageCount: number;
};

type DuplicatePair = {
	keepId: number;
	loseId: number;
	score: number;
	reason: string;
	keep: ProductRow;
	lose: ProductRow;
};

type CliOptions = {
	dryRun: boolean;
	outputDir: string;
	limit: number | null;
};

const options = parseCliArgs(process.argv.slice(2));
const db = createLowConnectionDb(getDbUrl());

const allProducts = await loadActiveProducts();
const duplicatePairs = findDuplicatePairs(allProducts).slice(
	0,
	options.limit ?? Number.POSITIVE_INFINITY,
);

await ensureDir(options.outputDir);

const reportsDir = path.join(options.outputDir, "reports");
await ensureDir(reportsDir);

const applied: DuplicatePair[] = [];

for (const pair of duplicatePairs) {
	if (!options.dryRun) {
		await mergeDuplicatePair(pair);
	}
	applied.push(pair);
}

await writeJsonAtomic(path.join(reportsDir, "duplicates.json"), applied);
await writeJsonAtomic(path.join(reportsDir, "summary.json"), {
	totalActiveProducts: allProducts.length,
	candidatePairs: duplicatePairs.length,
	appliedPairs: applied.length,
	dryRun: options.dryRun,
});

console.log(
	JSON.stringify(
		{
			totalActiveProducts: allProducts.length,
			candidatePairs: duplicatePairs.length,
			appliedPairs: applied.length,
			dryRun: options.dryRun,
			outputDir: options.outputDir,
		},
		null,
		2,
	),
);

async function loadActiveProducts(): Promise<ProductRow[]> {
	const rows = await db
		.select({
			id: ProductsTable.id,
			name: ProductsTable.name,
			slug: ProductsTable.slug,
			amount: ProductsTable.amount,
			potency: ProductsTable.potency,
			price: ProductsTable.price,
			status: ProductsTable.status,
			brandName: BrandsTable.name,
			imageCount: ProductsTable.id,
		})
		.from(ProductsTable)
		.innerJoin(BrandsTable, eq(BrandsTable.id, ProductsTable.brandId))
		.where(
			and(
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
				isNull(BrandsTable.deletedAt),
			),
		);

	const imageRows = await db
		.select({
			productId: ProductImagesTable.productId,
		})
		.from(ProductImagesTable)
		.where(isNull(ProductImagesTable.deletedAt));

	const imageCountByProductId = new Map<number, number>();
	for (const row of imageRows) {
		imageCountByProductId.set(
			row.productId,
			(imageCountByProductId.get(row.productId) ?? 0) + 1,
		);
	}

	return rows.map((row) => ({
		...row,
		imageCount: imageCountByProductId.get(row.id) ?? 0,
	}));
}

function findDuplicatePairs(products: ProductRow[]): DuplicatePair[] {
	const byBrand = new Map<string, ProductRow[]>();
	for (const product of products) {
		const key = normalizeText(product.brandName);
		const list = byBrand.get(key) ?? [];
		list.push(product);
		byBrand.set(key, list);
	}

	const forcedKeepByPair = new Map<string, number>([
		["7403:7458", 7403],
		["7425:7428", 7425],
		["6998:7006", 7006],
	]);
	const candidatePairs: DuplicatePair[] = [];

	for (const brandProducts of byBrand.values()) {
		for (let leftIndex = 0; leftIndex < brandProducts.length; leftIndex += 1) {
			for (
				let rightIndex = leftIndex + 1;
				rightIndex < brandProducts.length;
				rightIndex += 1
			) {
				const left = brandProducts[leftIndex];
				const right = brandProducts[rightIndex];
				if (!left || !right) continue;

				const forcedKey = `${Math.min(left.id, right.id)}:${Math.max(left.id, right.id)}`;
				const forcedKeepId = forcedKeepByPair.get(forcedKey) ?? null;
				const forced = forcedKeepId !== null;

				if (!forced && left.price !== right.price) continue;

				const amountLeft = normalizeAmount(left.amount);
				const amountRight = normalizeAmount(right.amount);
				if (
					!forced &&
					amountLeft &&
					amountRight &&
					amountLeft !== amountRight
				) {
					continue;
				}

				const potencyLeft = normalizePotency(left.potency);
				const potencyRight = normalizePotency(right.potency);
				if (
					!forced &&
					potencyLeft &&
					potencyRight &&
					potencyLeft !== potencyRight &&
					!potencyLeft.includes(potencyRight) &&
					!potencyRight.includes(potencyLeft)
				) {
					continue;
				}

				const nameLeft = normalizeComparableName(left);
				const nameRight = normalizeComparableName(right);
				const score = forced ? 1 : compareTwoStrings(nameLeft, nameRight);
				const tokenOverlap = overlapScore(nameLeft, nameRight);

				if (!forced && score < 0.72 && tokenOverlap < 0.78) continue;

				const keep = forced
					? left.id === forcedKeepId
						? left
						: right
					: chooseKeeper(left, right);
				const lose = keep.id === left.id ? right : left;

				candidatePairs.push({
					keepId: keep.id,
					loseId: lose.id,
					score: Math.max(score, tokenOverlap),
					reason: forced
						? "manual_example_match"
						: `same brand/price and highly similar title (similarity=${score.toFixed(3)}, overlap=${tokenOverlap.toFixed(3)})`,
					keep,
					lose,
				});
			}
		}
	}

	const chosenByLoser = new Map<number, DuplicatePair>();
	for (const pair of candidatePairs.sort(
		(left, right) => right.score - left.score,
	)) {
		const existing = chosenByLoser.get(pair.loseId);
		if (!existing || pair.score > existing.score) {
			chosenByLoser.set(pair.loseId, pair);
		}
	}

	return [...chosenByLoser.values()].sort(
		(left, right) => right.score - left.score || left.keepId - right.keepId,
	);
}

function chooseKeeper(left: ProductRow, right: ProductRow) {
	if (left.imageCount !== right.imageCount) {
		return left.imageCount > right.imageCount ? left : right;
	}
	if (left.slug.length !== right.slug.length) {
		return left.slug.length <= right.slug.length ? left : right;
	}
	if (left.name.length !== right.name.length) {
		return left.name.length <= right.name.length ? left : right;
	}
	return left.id <= right.id ? left : right;
}

async function mergeDuplicatePair(pair: DuplicatePair) {
	const loserImages = await db
		.select({
			id: ProductImagesTable.id,
			url: ProductImagesTable.url,
			isPrimary: ProductImagesTable.isPrimary,
		})
		.from(ProductImagesTable)
		.where(
			and(
				eq(ProductImagesTable.productId, pair.loseId),
				isNull(ProductImagesTable.deletedAt),
			),
		);

	const keeperImages = await db
		.select({
			url: ProductImagesTable.url,
		})
		.from(ProductImagesTable)
		.where(
			and(
				eq(ProductImagesTable.productId, pair.keepId),
				isNull(ProductImagesTable.deletedAt),
			),
		);

	const keeperUrls = new Set(keeperImages.map((image) => image.url));
	const newImages = loserImages
		.filter((image) => !keeperUrls.has(image.url))
		.map((image) => ({
			productId: pair.keepId,
			url: image.url,
			isPrimary: false,
		}));

	if (newImages.length > 0) {
		await db.insert(ProductImagesTable).values(newImages);
	}

	await db
		.update(ProductsTable)
		.set({
			status: "draft",
			stock: 0,
		})
		.where(
			and(eq(ProductsTable.id, pair.loseId), isNull(ProductsTable.deletedAt)),
		);
}

function normalizeComparableName(product: ProductRow) {
	const base = normalizeText(
		`${product.name} ${product.potency} ${product.amount}`
			.replace(product.brandName, " ")
			.replace(product.amount, " ")
			.replace(product.potency, " "),
	);
	return base
		.split(" ")
		.filter((token) => token.length > 2 && !STOP_WORDS.has(token))
		.join(" ");
}

function normalizeAmount(value: string) {
	return normalizeText(value).replace(/\s+/g, "");
}

function normalizePotency(value: string) {
	return normalizeText(value)
		.replace(/\b(per|serving|with|made|for|and|or|of|from)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function overlapScore(left: string, right: string) {
	const leftTokens = new Set(left.split(" ").filter(Boolean));
	const rightTokens = new Set(right.split(" ").filter(Boolean));
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
	let overlap = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) overlap += 1;
	}
	return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function getDbUrl(): string {
	if (
		process.env.PLANETSCALE_USER &&
		process.env.PLANETSCALE_PASSWORD &&
		process.env.PLANETSCALE_HOST &&
		process.env.PLANETSCALE_DATABASE
	) {
		return `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}:6432/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
	}
	if (process.env.DIRECT_DB_URL) return process.env.DIRECT_DB_URL;
	throw new Error(
		"DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env",
	);
}

function createLowConnectionDb(connectionString: string) {
	const client = postgres(connectionString, {
		ssl: "require",
		max: 1,
		fetch_types: false,
		idle_timeout: 5,
		connect_timeout: 30,
	});

	return drizzle(client, {
		schema: {
			BrandsTable,
			ProductImagesTable,
			ProductsTable,
		},
	});
}

function parseCliArgs(args: string[]): CliOptions {
	const defaultOutputDir = path.resolve(REPO_ROOT, "vit/.vit-ai/db-duplicates");

	let dryRun = false;
	let outputDir = defaultOutputDir;
	let limit: number | null = null;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--dry-run") dryRun = true;
		if (arg === "--output-dir") {
			outputDir = path.resolve(REPO_ROOT, args[++index] ?? outputDir);
		}
		if (arg === "--limit") {
			limit = Number.parseInt(args[++index] ?? "", 10);
		}
	}

	return { dryRun, outputDir, limit };
}

async function ensureDir(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown) {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}
