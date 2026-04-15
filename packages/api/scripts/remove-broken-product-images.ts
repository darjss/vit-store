import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config as loadDotEnv } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ProductImagesTable, ProductsTable } from "../src/db/schema";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

loadDotEnv({ path: path.resolve(REPO_ROOT, ".env") });
loadDotEnv({
	path: path.resolve(import.meta.dir, "../../.env"),
	override: false,
});

type ImageRow = {
	id: number;
	productId: number;
	url: string;
	productName: string;
};

type CliOptions = {
	dryRun: boolean;
	concurrency: number;
	outputDir: string;
	limit: number | null;
};

type AuditResult = {
	imageId: number;
	productId: number;
	productName: string;
	url: string;
	kind: "kept" | "deleted";
	reason: string;
};

const options = parseCliArgs(process.argv.slice(2));
const db = createLowConnectionDb(getDbUrl());

const rows = await loadNonPrimaryImages();
const selectedRows = rows.slice(0, options.limit ?? rows.length);
const reportsDir = path.join(options.outputDir, "reports");
await ensureDir(reportsDir);

const results: AuditResult[] = [];
await runPool(selectedRows, options.concurrency, async (row) => {
	const validation = await validateImageUrl(row.url);
	if (validation.ok) {
		results.push({
			imageId: row.id,
			productId: row.productId,
			productName: row.productName,
			url: row.url,
			kind: "kept",
			reason: validation.reason,
		});
		return;
	}

	if (!options.dryRun) {
		await db
			.update(ProductImagesTable)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(ProductImagesTable.id, row.id),
					isNull(ProductImagesTable.deletedAt),
				),
			);
	}

	results.push({
		imageId: row.id,
		productId: row.productId,
		productName: row.productName,
		url: row.url,
		kind: "deleted",
		reason: validation.reason,
	});
});

await writeJsonAtomic(
	path.join(reportsDir, "deleted.json"),
	results.filter((result) => result.kind === "deleted"),
);
await writeJsonAtomic(
	path.join(reportsDir, "kept.json"),
	results.filter((result) => result.kind === "kept"),
);
await writeJsonAtomic(path.join(reportsDir, "summary.json"), {
	total: selectedRows.length,
	deleted: results.filter((result) => result.kind === "deleted").length,
	kept: results.filter((result) => result.kind === "kept").length,
	dryRun: options.dryRun,
});

console.log(
	JSON.stringify(
		{
			total: selectedRows.length,
			deleted: results.filter((result) => result.kind === "deleted").length,
			kept: results.filter((result) => result.kind === "kept").length,
			dryRun: options.dryRun,
			outputDir: options.outputDir,
		},
		null,
		2,
	),
);

async function loadNonPrimaryImages(): Promise<ImageRow[]> {
	return db
		.select({
			id: ProductImagesTable.id,
			productId: ProductImagesTable.productId,
			url: ProductImagesTable.url,
			productName: ProductsTable.name,
		})
		.from(ProductImagesTable)
		.innerJoin(
			ProductsTable,
			eq(ProductsTable.id, ProductImagesTable.productId),
		)
		.where(
			and(
				eq(ProductsTable.status, "active"),
				eq(ProductImagesTable.isPrimary, false),
				isNull(ProductImagesTable.deletedAt),
				isNull(ProductsTable.deletedAt),
			),
		);
}

async function validateImageUrl(url: string) {
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "image/*",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(20000),
		});

		if (!response.ok) {
			return { ok: false, reason: `http_${response.status}` };
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.startsWith("image/")) {
			return { ok: false, reason: `content_type_${contentType || "missing"}` };
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.length < 1024) {
			return { ok: false, reason: "image_too_small" };
		}

		const tempDir = await mkdtemp(path.join(os.tmpdir(), "vit-image-check-"));
		const extension = extensionFromContentType(contentType);
		const tempPath = path.join(tempDir, `image.${extension}`);
		await writeFile(tempPath, buffer);

		try {
			await execFileAsync("identify", ["-ping", tempPath], {
				timeout: 15000,
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}

		return { ok: true, reason: "valid_image" };
	} catch (error) {
		return {
			ok: false,
			reason:
				error instanceof Error ? error.message : "unknown_validation_error",
		};
	}
}

function extensionFromContentType(contentType: string) {
	if (contentType.includes("png")) return "png";
	if (contentType.includes("gif")) return "gif";
	if (contentType.includes("webp")) return "webp";
	if (contentType.includes("avif")) return "avif";
	return "jpg";
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
			ProductImagesTable,
			ProductsTable,
		},
	});
}

function parseCliArgs(args: string[]): CliOptions {
	const defaultOutputDir = path.resolve(
		REPO_ROOT,
		"vit/.vit-ai/broken-product-images",
	);

	let dryRun = false;
	let concurrency = 6;
	let outputDir = defaultOutputDir;
	let limit: number | null = null;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--dry-run") dryRun = true;
		if (arg === "--concurrency") {
			concurrency = Math.max(
				1,
				Number.parseInt(args[++index] ?? `${concurrency}`, 10),
			);
		}
		if (arg === "--output-dir") {
			outputDir = path.resolve(REPO_ROOT, args[++index] ?? outputDir);
		}
		if (arg === "--limit") {
			limit = Number.parseInt(args[++index] ?? "", 10);
		}
	}

	return { dryRun, concurrency, outputDir, limit };
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
