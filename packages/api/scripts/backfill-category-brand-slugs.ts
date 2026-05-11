import { config } from "dotenv";
import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

config({ path: "../../.env" });

const connStr = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\u0400-\u04FF]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function backfillSlugs() {
	const client = postgres(connStr, { ssl: "require", max: 5, fetch_types: false });
	const db = drizzle(client, { schema });

	console.log("Backfilling category slugs...");
	const categories = await db.query.CategoriesTable.findMany({
		where: isNull(schema.CategoriesTable.deletedAt),
	});

	for (const category of categories) {
		if (category.slug && category.slug !== "") continue;
		const slug = slugify(category.name);
		await db
			.update(schema.CategoriesTable)
			.set({ slug })
			.where(eq(schema.CategoriesTable.id, category.id));
		console.log(`  Category "${category.name}" -> "${slug}"`);
	}

	console.log("Backfilling brand slugs...");
	const brands = await db.query.BrandsTable.findMany({
		where: isNull(schema.BrandsTable.deletedAt),
	});

	for (const brand of brands) {
		if (brand.slug && brand.slug !== "") continue;
		const slug = slugify(brand.name);
		await db
			.update(schema.BrandsTable)
			.set({ slug })
			.where(eq(schema.BrandsTable.id, brand.id));
		console.log(`  Brand "${brand.name}" -> "${slug}"`);
	}

	await client.end();
	console.log("Done!");
}

backfillSlugs().catch((err) => {
	console.error("Backfill failed:", err);
	process.exit(1);
});
