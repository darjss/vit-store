import { config } from "dotenv";
import postgres from "postgres";

config({ path: "../../.env" });

const connStr = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\u0400-\u04FF]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function run() {
	const client = postgres(connStr, { ssl: "require", max: 1 });

	// Ensure columns exist without unique constraints first
	await client.unsafe(`
		ALTER TABLE "ecom_vit_brand"
			ADD COLUMN IF NOT EXISTS "slug" varchar(256) NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS "description" text,
			ADD COLUMN IF NOT EXISTS "banner_image" varchar(512),
			ADD COLUMN IF NOT EXISTS "seo_title" varchar(256),
			ADD COLUMN IF NOT EXISTS "seo_description" varchar(512);

		ALTER TABLE "ecom_vit_category"
			ADD COLUMN IF NOT EXISTS "slug" varchar(256) NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS "description" text,
			ADD COLUMN IF NOT EXISTS "banner_image" varchar(512),
			ADD COLUMN IF NOT EXISTS "seo_title" varchar(256),
			ADD COLUMN IF NOT EXISTS "seo_description" varchar(512);
	`);

	// Backfill ALL category slugs (including deleted ones, to satisfy unique constraint)
	console.log("Backfilling category slugs...");
	const categories = await client`SELECT id, name FROM ecom_vit_category`;
	const usedCategorySlugs = new Set<string>();
	for (const cat of categories) {
		let slug = slugify(cat.name);
		let counter = 1;
		while (usedCategorySlugs.has(slug)) {
			slug = `${slugify(cat.name)}-${counter}`;
			counter++;
		}
		usedCategorySlugs.add(slug);
		await client`UPDATE ecom_vit_category SET slug = ${slug} WHERE id = ${cat.id}`;
		console.log(`  ${cat.name} -> ${slug}`);
	}

	// Backfill ALL brand slugs (including deleted ones)
	console.log("Backfilling brand slugs...");
	const brands = await client`SELECT id, name FROM ecom_vit_brand`;
	const usedBrandSlugs = new Set<string>();
	for (const brand of brands) {
		let slug = slugify(brand.name);
		let counter = 1;
		while (usedBrandSlugs.has(slug)) {
			slug = `${slugify(brand.name)}-${counter}`;
			counter++;
		}
		usedBrandSlugs.add(slug);
		await client`UPDATE ecom_vit_brand SET slug = ${slug} WHERE id = ${brand.id}`;
		console.log(`  ${brand.name} -> ${slug}`);
	}

	// Now add unique constraints and indexes
	await client.unsafe(`
		ALTER TABLE "ecom_vit_brand"
			DROP CONSTRAINT IF EXISTS "ecom_vit_brand_slug_unique",
			ADD CONSTRAINT "ecom_vit_brand_slug_unique" UNIQUE("slug");

		DROP INDEX IF EXISTS "brand_slug_idx";
		CREATE INDEX "brand_slug_idx" ON "ecom_vit_brand" USING btree ("slug");

		ALTER TABLE "ecom_vit_category"
			DROP CONSTRAINT IF EXISTS "ecom_vit_category_slug_unique",
			ADD CONSTRAINT "ecom_vit_category_slug_unique" UNIQUE("slug");

		DROP INDEX IF EXISTS "category_slug_idx";
		CREATE INDEX "category_slug_idx" ON "ecom_vit_category" USING btree ("slug");
	`);

	await client.end();
	console.log("Migration and backfill complete!");
}

run().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
