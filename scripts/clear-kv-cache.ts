#!/usr/bin/env bun
/**
 * Clear specific KV cache keys both locally and remotely.
 * Usage: bun run scripts/clear-kv-cache.ts [brands|analytics|all]
 */

import Database from "bun:sqlite";
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PROD_KV_NAMESPACE_ID = "07cd4a83a89c40f098eb62945c0bc09f";

// Known cache keys
const BRAND_KEY = "catalog:brands:all";
const CATEGORY_KEY = "catalog:categories:all";

// Analytics cache keys (SHA-256 of path + input)
const ANALYTICS_KEYS = [
	// analytics.getCurrentProductsValue (no input)
	"cache:3a51ec08301e953f151047eadb4fc3a44aadaf43b3f2546afcbddef699aa2730",
	// analytics.getAnalyticsData with timeRange: daily
	"cache:4d6dfe2db88b45d6d720a94587b139b9046bda132d9892a612c8698f823af2f7",
	// analytics.getAnalyticsData with timeRange: weekly
	"cache:5232b1e1bb5a2b3e871138e1d97f509cc8f346f4b5195bb149ee7f81381c7dae",
	// analytics.getAnalyticsData with timeRange: monthly
	"cache:76a329d5c3fbb76e6ab0058c83b0bbf05fd3c177d9f753f17603bf3398eb19d6",
];

async function clearLocalKV(keys: string[]) {
	const dbPath =
		".alchemy/miniflare/v3/kv/miniflare-KVNamespaceObject/8e2fd0c8cb293336e2f337f5e640dc8030b17a02425b467fcd48f342cecf510f.sqlite";
	const blobsDir = ".alchemy/miniflare/v3/kv/kv/blobs";

	if (!await Bun.file(dbPath).exists()) {
		console.log("⚠️ Local KV database not found, skipping local cleanup");
		return;
	}

	const db = new Database(dbPath);

	// Build WHERE clause
	const placeholders = keys.map(() => "?").join(",");
	const stmt = db.query(`SELECT key, blob_id FROM _mf_entries WHERE key IN (${placeholders})`);
	const found = stmt.all(...keys) as Array<{ key: string; blob_id: string }>;

	if (found.length === 0) {
		console.log("✅ No matching keys found in local KV");
		db.close();
		return;
	}

	console.log(`🗑️  Deleting ${found.length} keys from local KV:`);
	for (const { key } of found) {
		console.log(`   - ${key}`);
	}

	const deleteStmt = db.query(`DELETE FROM _mf_entries WHERE key IN (${placeholders})`);
	deleteStmt.run(...keys);

	// Clean up orphaned blobs
	const usedBlobs = new Set(
		(db.query("SELECT blob_id FROM _mf_entries").all() as Array<{ blob_id: string }>).map(
			(r) => r.blob_id,
		),
	);

	let blobsCleaned = 0;
	for (const file of readdirSync(blobsDir)) {
		if (!usedBlobs.has(file)) {
			try {
				unlinkSync(join(blobsDir, file));
				blobsCleaned++;
			} catch {}
		}
	}

	console.log(`🧹 Cleaned up ${blobsCleaned} orphaned blob files`);
	db.close();
}

async function clearRemoteKV(keys: string[]) {
	console.log("\n☁️  Clearing remote prod KV...");
	for (const key of keys) {
		const proc = Bun.spawnSync({
			cmd: [
				"npx",
				"wrangler",
				"kv",
				"key",
				"delete",
				key,
				"--namespace-id",
				PROD_KV_NAMESPACE_ID,
				"--remote",
			],
			stdio: ["inherit", "pipe", "pipe"],
		});
		const output = proc.stdout.toString().trim();
		const errOutput = proc.stderr.toString().trim();
		if (proc.success) {
			console.log(`   ✅ Deleted: ${key}`);
		} else {
			console.log(`   ⚠️  ${key}: ${errOutput || output}`);
		}
	}
}

async function main() {
	const target = process.argv[2] || "all";

	let keysToDelete: string[] = [];

	switch (target) {
		case "brands":
			keysToDelete = [BRAND_KEY];
			break;
		case "analytics":
			keysToDelete = [...ANALYTICS_KEYS];
			break;
		case "all":
			keysToDelete = [BRAND_KEY, ...ANALYTICS_KEYS];
			break;
		default:
			console.log(`Usage: bun run scripts/clear-kv-cache.ts [brands|analytics|all]`);
			process.exit(1);
	}

	console.log(`🎯 Target: ${target}\n`);

	await clearLocalKV(keysToDelete);
	await clearRemoteKV(keysToDelete);

	console.log("\n✅ Done!");
}

main().catch(console.error);
