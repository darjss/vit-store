import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { ProductImagesTable, ProductsTable } from "../src/db/schema";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

loadDotEnv({ path: path.resolve(REPO_ROOT, ".env") });
loadDotEnv({
	path: path.resolve(import.meta.dir, "../../.env"),
	override: false,
});

type CreatedProductRow = {
	canonicalKey: string;
	productId: number;
	mode: "created" | "reused_existing";
};

type ProductRecord = {
	id: number;
	name: string;
	slug: string;
	brandId: number;
	status: string;
};

type ProductImageRow = {
	id: number;
	productId: number;
	url: string;
	isPrimary: boolean;
};

type UploadedResponse = {
	images: Array<{ url: string }>;
	status: string;
	time: number;
};

type CliOptions = {
	inputPath: string;
	outputDir: string;
	concurrency: number;
	resume: boolean;
	limit: number | null;
	modes: Array<CreatedProductRow["mode"]>;
	onlyProductId: number | null;
	dryRun: boolean;
	backendUrl: string | null;
};

type MigrationResult =
	| {
			kind: "updated";
			productId: number;
			canonicalKey: string;
			mode: CreatedProductRow["mode"];
			productName: string;
			sourceImageCount: number;
			keptSourceUrls: string[];
			cdnUrls: string[];
			primaryIndex: number;
			reason: string;
	  }
	| {
			kind: "skipped";
			productId: number;
			canonicalKey: string;
			mode: CreatedProductRow["mode"];
			productName: string;
			reason: string;
	  }
	| {
			kind: "failed";
			productId: number;
			canonicalKey: string;
			mode: CreatedProductRow["mode"];
			productName: string;
			reason: string;
	  };

const imageDecisionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(6),
	primaryIndex: z.number().int().min(0).nullable(),
	reason: z.string(),
});

const options = parseCliArgs(process.argv.slice(2));
const db = createLowConnectionDb(getDbUrl());

const inputRows = JSON.parse(
	await readFile(options.inputPath, "utf8"),
) as CreatedProductRow[];

const filteredRows = inputRows
	.filter((row) => options.modes.includes(row.mode))
	.filter((row) =>
		options.onlyProductId ? row.productId === options.onlyProductId : true,
	)
	.slice(0, options.limit ?? inputRows.length);

const resultsDir = path.join(options.outputDir, "results");
const reportsDir = path.join(options.outputDir, "reports");
await ensureDir(resultsDir);
await ensureDir(reportsDir);

await runPool(filteredRows, options.concurrency, async (row) => {
	const resultPath = path.join(resultsDir, `${row.productId}.json`);
	if (options.resume) {
		try {
			await readFile(resultPath, "utf8");
			return;
		} catch {}
	}

	const result = await migrateProductImages(row, options.backendUrl);
	await writeJsonAtomic(resultPath, result);
});

const results = await loadResults(resultsDir);
await writeJsonAtomic(
	path.join(reportsDir, "updated.json"),
	results.filter(
		(result): result is Extract<MigrationResult, { kind: "updated" }> =>
			result.kind === "updated",
	),
);
await writeJsonAtomic(
	path.join(reportsDir, "skipped.json"),
	results.filter(
		(result): result is Extract<MigrationResult, { kind: "skipped" }> =>
			result.kind === "skipped",
	),
);
await writeJsonAtomic(
	path.join(reportsDir, "failed.json"),
	results.filter(
		(result): result is Extract<MigrationResult, { kind: "failed" }> =>
			result.kind === "failed",
	),
);
await writeJsonAtomic(path.join(reportsDir, "summary.json"), {
	total: filteredRows.length,
	completed: results.length,
	updated: results.filter((result) => result.kind === "updated").length,
	skipped: results.filter((result) => result.kind === "skipped").length,
	failed: results.filter((result) => result.kind === "failed").length,
	dryRun: options.dryRun,
});

console.log(
	JSON.stringify(
		{
			total: filteredRows.length,
			completed: results.length,
			updated: results.filter((result) => result.kind === "updated").length,
			skipped: results.filter((result) => result.kind === "skipped").length,
			failed: results.filter((result) => result.kind === "failed").length,
			outputDir: options.outputDir,
		},
		null,
		2,
	),
);

async function migrateProductImages(
	row: CreatedProductRow,
	backendUrl: string | null,
): Promise<MigrationResult> {
	const product = await db.query.ProductsTable.findFirst({
		where: and(
			eq(ProductsTable.id, row.productId),
			isNull(ProductsTable.deletedAt),
		),
		columns: {
			id: true,
			name: true,
			slug: true,
			brandId: true,
			status: true,
		},
	});

	if (!product) {
		return {
			kind: "failed",
			productId: row.productId,
			canonicalKey: row.canonicalKey,
			mode: row.mode,
			productName: "unknown",
			reason: "Product not found.",
		};
	}

	const images = await db
		.select({
			id: ProductImagesTable.id,
			productId: ProductImagesTable.productId,
			url: ProductImagesTable.url,
			isPrimary: ProductImagesTable.isPrimary,
		})
		.from(ProductImagesTable)
		.where(
			and(
				eq(ProductImagesTable.productId, row.productId),
				isNull(ProductImagesTable.deletedAt),
			),
		);

	if (images.length === 0) {
		return {
			kind: "skipped",
			productId: row.productId,
			canonicalKey: row.canonicalKey,
			mode: row.mode,
			productName: product.name,
			reason: "No active product images found.",
		};
	}

	const remoteSourceImages = images.filter((image) => !isOwnCdnUrl(image.url));
	if (remoteSourceImages.length === 0) {
		return {
			kind: "skipped",
			productId: row.productId,
			canonicalKey: row.canonicalKey,
			mode: row.mode,
			productName: product.name,
			reason: "Product images are already on the CDN.",
		};
	}

	try {
		const decision = await selectProductImages(product, remoteSourceImages);
		const keptSourceUrls = decision.keepIndices
			.map((index) => remoteSourceImages[index]?.url)
			.filter((url): url is string => Boolean(url));

		if (keptSourceUrls.length === 0) {
			return {
				kind: "skipped",
				productId: row.productId,
				canonicalKey: row.canonicalKey,
				mode: row.mode,
				productName: product.name,
				reason: `LLM rejected all source images. ${decision.reason}`,
			};
		}

		const chosenPrimaryIndex = Math.min(
			Math.max(decision.primaryIndex ?? 0, 0),
			keptSourceUrls.length - 1,
		);

		if (options.dryRun) {
			return {
				kind: "updated",
				productId: row.productId,
				canonicalKey: row.canonicalKey,
				mode: row.mode,
				productName: product.name,
				sourceImageCount: remoteSourceImages.length,
				keptSourceUrls,
				cdnUrls: keptSourceUrls,
				primaryIndex: chosenPrimaryIndex,
				reason: decision.reason,
			};
		}

		if (!backendUrl) {
			return {
				kind: "failed",
				productId: row.productId,
				canonicalKey: row.canonicalKey,
				mode: row.mode,
				productName: product.name,
				reason:
					"BACKEND_URL, BUN_PUBLIC_BACKEND_URL, or --backend-url is required for uploads.",
			};
		}

		const uploaded = await uploadUrlsToCdn(
			backendUrl,
			product.slug,
			rotatePrimaryFirst(keptSourceUrls, chosenPrimaryIndex),
		);
		const cdnUrls = uploaded.images
			.map((image) => image.url)
			.filter((url) => isOwnCdnUrl(url));

		if (cdnUrls.length === 0) {
			return {
				kind: "failed",
				productId: row.productId,
				canonicalKey: row.canonicalKey,
				mode: row.mode,
				productName: product.name,
				reason: "Upload completed but no CDN URLs were returned.",
			};
		}

		await db
			.update(ProductImagesTable)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(ProductImagesTable.productId, row.productId),
					isNull(ProductImagesTable.deletedAt),
				),
			);

		await db.insert(ProductImagesTable).values(
			cdnUrls.map((url, index) => ({
				productId: row.productId,
				url,
				isPrimary: index === 0,
			})),
		);

		return {
			kind: "updated",
			productId: row.productId,
			canonicalKey: row.canonicalKey,
			mode: row.mode,
			productName: product.name,
			sourceImageCount: remoteSourceImages.length,
			keptSourceUrls,
			cdnUrls,
			primaryIndex: 0,
			reason: decision.reason,
		};
	} catch (error) {
		return {
			kind: "failed",
			productId: row.productId,
			canonicalKey: row.canonicalKey,
			mode: row.mode,
			productName: product.name,
			reason:
				error instanceof Error
					? error.message
					: "Unknown image migration failure.",
		};
	}
}

async function selectProductImages(
	product: ProductRecord,
	images: ProductImageRow[],
) {
	const content = await Promise.all(
		images.map(async (image, index) => {
			const response = await fetch(image.url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "image/*",
				},
				signal: AbortSignal.timeout(20000),
			});
			if (!response.ok) {
				throw new Error(`Failed to fetch image ${index}: ${response.status}`);
			}
			const mediaType = response.headers.get("content-type") || "image/jpeg";
			const buffer = Buffer.from(await response.arrayBuffer());
			return {
				type: "image" as const,
				image: buffer,
				mediaType,
			};
		}),
	);

	const { object } = await generateObject({
		model: google("gemini-2.5-flash"),
		schema: imageDecisionSchema,
		system: [
			"You are selecting ecommerce product images to keep.",
			"Keep only images that clearly show the actual sellable product packaging or container for the same product.",
			"Allowed: front, back, side, alternate angle of the product bottle/box/pouch, as long as the same product is clearly shown.",
			"Reject: lifestyle photos, ingredient callouts, charts, comparison graphics, text-only slides, unrelated products, bundles where the target product is not clear, or decorative images.",
			"Prefer 1 to 4 strong product shots.",
			"Set primaryIndex to the single best front-facing product image among keepIndices.",
			"If only one valid image exists, keep just that one.",
		].join(" "),
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								productId: product.id,
								productName: product.name,
								productSlug: product.slug,
								imageCount: images.length,
								candidateUrls: images.map((image) => image.url),
							},
							null,
							2,
						),
					},
					...content,
				],
			},
		],
	});

	return object;
}

async function uploadUrlsToCdn(
	backendUrl: string,
	slug: string,
	urls: string[],
): Promise<UploadedResponse> {
	const prefix = `products/catalog/${slug}`.replace(/[^a-zA-Z0-9/_-]/g, "-");
	const response = await fetch(
		`${backendUrl.replace(/\/+$/, "")}/upload/images/urls?prefix=${encodeURIComponent(prefix)}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(urls.map((url) => ({ url }))),
		},
	);

	if (!response.ok) {
		throw new Error(
			`Backend image upload failed: ${response.status} ${response.statusText}`,
		);
	}

	return (await response.json()) as UploadedResponse;
}

function rotatePrimaryFirst(urls: string[], primaryIndex: number) {
	if (primaryIndex <= 0 || primaryIndex >= urls.length) return urls;
	const primaryUrl = urls[primaryIndex];
	if (!primaryUrl) return urls;
	return [primaryUrl, ...urls.filter((_, index) => index !== primaryIndex)];
}

function isOwnCdnUrl(url: string) {
	return (
		url.startsWith("https://cdn.darjs.dev/") ||
		url.includes(".r2.dev/") ||
		url.includes("pub-b7dba2c2817f4a82971b1c3a86e3dafa.r2.dev")
	);
}

function parseCliArgs(args: string[]): CliOptions {
	const defaultInputPath = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/shelf-sync-apply/reports/created-products.json",
	);
	const defaultOutputDir = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/migrate-created-product-images",
	);

	let inputPath = defaultInputPath;
	let outputDir = defaultOutputDir;
	let concurrency = 3;
	let resume = false;
	let limit: number | null = null;
	let modes: Array<CreatedProductRow["mode"]> = ["created", "reused_existing"];
	let onlyProductId: number | null = null;
	let dryRun = false;
	let backendUrl = getBackendUrl();

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--input")
			inputPath = path.resolve(REPO_ROOT, args[++index] ?? inputPath);
		if (arg === "--output-dir")
			outputDir = path.resolve(REPO_ROOT, args[++index] ?? outputDir);
		if (arg === "--concurrency") {
			concurrency = Math.max(
				1,
				Number.parseInt(args[++index] ?? `${concurrency}`, 10),
			);
		}
		if (arg === "--resume") resume = true;
		if (arg === "--limit") limit = Number.parseInt(args[++index] ?? "", 10);
		if (arg === "--mode") {
			const value = args[++index];
			if (value === "created") modes = ["created"];
			if (value === "reused") modes = ["reused_existing"];
			if (value === "all") modes = ["created", "reused_existing"];
		}
		if (arg === "--product-id") {
			onlyProductId = Number.parseInt(args[++index] ?? "", 10);
		}
		if (arg === "--dry-run") dryRun = true;
		if (arg === "--backend-url") backendUrl = args[++index] ?? backendUrl;
	}

	return {
		inputPath,
		outputDir,
		concurrency,
		resume,
		limit,
		modes,
		onlyProductId,
		dryRun,
		backendUrl,
	};
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
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(
		connectionString,
	);
	const client = postgres(connectionString, {
		ssl: isHyperdriveProxy ? false : "require",
		max: 1,
		fetch_types: false,
		idle_timeout: 5,
		connect_timeout: 30,
	});

	return drizzle(client, {
		schema: {
			ProductImagesTable,
			ProductsTable,
		},
	});
}

function getBackendUrl(): string | null {
	const value = process.env.BACKEND_URL ?? process.env.BUN_PUBLIC_BACKEND_URL;
	if (!value) return null;
	return value;
}

async function loadResults(resultsDir: string): Promise<MigrationResult[]> {
	const entries = await readdir(resultsDir).catch(() => []);
	const files = entries.filter((entry) => entry.endsWith(".json")).sort();
	return Promise.all(
		files.map(async (entry) => {
			return JSON.parse(
				await readFile(path.join(resultsDir, entry), "utf8"),
			) as MigrationResult;
		}),
	);
}

async function ensureDir(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown) {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

async function runPool<T>(
	items: T[],
	concurrency: number,
	handler: (item: T) => Promise<void>,
) {
	const queue = [...items];
	await Promise.all(
		Array.from(
			{ length: Math.min(concurrency, items.length || 1) },
			async () => {
				for (;;) {
					const item = queue.shift();
					if (!item) return;
					await handler(item);
				}
			},
		),
	);
}
