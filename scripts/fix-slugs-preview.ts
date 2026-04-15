#!/usr/bin/env bun
// Script to preview product slugs that need fixing
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../packages/api/src/db/schema";

// Load from environment
const host = process.env.PLANETSCALE_HOST;
const user = process.env.PLANETSCALE_USER;
const password = process.env.PLANETSCALE_PASSWORD;
const database = process.env.PLANETSCALE_DATABASE;

if (!host || !user || !password || !database) {
	console.error(
		"❌ Missing database credentials. Required environment variables:",
	);
	console.error("  - PLANETSCALE_HOST");
	console.error("  - PLANETSCALE_USER");
	console.error("  - PLANETSCALE_PASSWORD");
	console.error("  - PLANETSCALE_DATABASE");
	process.exit(1);
}

async function main() {
	console.log("🔍 Connecting to database...\n");

	const connectionString = `postgresql://${user}:${password}@${host}:5432/${database}?sslmode=require`;
	const client = postgres(connectionString);
	const db = drizzle(client, { schema });

	// Get all products
	const products = await db.query.ProductsTable.findMany();

	// Find problematic ones
	const problematic = products.filter((p) => !/^[a-z0-9-]+$/.test(p.slug));

	if (problematic.length === 0) {
		console.log("✅ No products with problematic slugs found!");
		await client.end();
		return;
	}

	console.log(`Found ${problematic.length} products with problematic slugs:\n`);

	for (const product of problematic) {
		console.log(`ID: ${product.id}`);
		console.log(`Name: ${product.name}`);
		console.log(`Current slug: ${product.slug}`);

		// Generate clean slug
		const cleanSlug = generateCleanSlug(product.name);
		const newSlug = `${cleanSlug}-${product.id}`;

		console.log(`New slug: ${newSlug}\n`);
	}

	console.log(
		"\n⚠️  These products have slugs with special characters that cause Cloudflare deployment issues.",
	);
	console.log("\nTo apply the fixes, run:");
	console.log("  bun run scripts/fix-slugs-apply.ts");

	await client.end();
}

function generateCleanSlug(inputText: string): string {
	return inputText
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

main().catch((err) => {
	console.error("❌ Error:", err);
	process.exit(1);
});
