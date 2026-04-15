#!/usr/bin/env bun
import { eq } from "drizzle-orm";
// Script to apply slug fixes to products
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../packages/api/src/db/schema";

const host = process.env.PLANETSCALE_HOST;
const user = process.env.PLANETSCALE_USER;
const password = process.env.PLANETSCALE_PASSWORD;
const database = process.env.PLANETSCALE_DATABASE;

if (!host || !user || !password || !database) {
	console.error("❌ Missing database credentials");
	process.exit(1);
}

async function main() {
	console.log("⚠️  WARNING: This will update product slugs in the database!");
	console.log("Products will get new slugs based on their current names.");
	console.log("Old URLs will break if slugs change.\n");

	// Check for --yes flag
	if (!process.argv.includes("--yes")) {
		console.log("To confirm, run with --yes flag:");
		console.log("  bun run scripts/fix-slugs-apply.ts --yes\n");

		// Run preview instead
		console.log("Running preview instead...\n");
		await import("./fix-slugs-preview.ts");
		return;
	}

	console.log("🔧 Applying slug fixes...\n");

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

	console.log(`Found ${problematic.length} products to fix\n`);

	let updated = 0;

	for (const product of problematic) {
		const cleanSlug = generateCleanSlug(product.name);
		const newSlug = `${cleanSlug}-${product.id}`;

		console.log(`Updating ID ${product.id}: ${product.slug} → ${newSlug}`);

		await db
			.update(schema.ProductsTable)
			.set({ slug: newSlug })
			.where(eq(schema.ProductsTable.id, product.id));

		updated++;
	}

	console.log(`\n✅ Updated ${updated} products successfully!`);
	console.log("\nNext steps:");
	console.log(
		"1. Rebuild the frontend: cd apps/storev2 && bun run astro build",
	);
	console.log("2. Redeploy to Cloudflare");

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
