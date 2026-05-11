import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

config({ path: "../../.env" });

const connStr = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;

const CYRILLIC_TO_LATIN: Record<string, string> = {
	а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
	ж: "j", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m",
	н: "n", о: "o", ө: "u", п: "p", р: "r", с: "s", т: "t",
	у: "u", ү: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
	щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(text: string): string {
	return Array.from(text.toLowerCase())
		.map((char) => CYRILLIC_TO_LATIN[char] ?? char)
		.join("");
}

function slugify(text: string): string {
	return transliterate(text)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function fixSlugs() {
	const client = postgres(connStr, { ssl: "require", max: 1, fetch_types: false });
	const db = drizzle(client, { schema });

	console.log("Fixing category slugs...");
	const categories = await db.query.CategoriesTable.findMany();
	const usedCategorySlugs = new Set(categories.map((c) => c.slug).filter(Boolean));

	for (const cat of categories) {
		const newSlug = slugify(cat.name);
		if (cat.slug === newSlug) continue; // already ASCII

		let finalSlug = newSlug;
		let counter = 1;
		while (usedCategorySlugs.has(finalSlug)) {
			finalSlug = `${newSlug}-${counter}`;
			counter++;
		}
		usedCategorySlugs.add(finalSlug);
		usedCategorySlugs.delete(cat.slug); // free up old slug

		await db.update(schema.CategoriesTable)
			.set({ slug: finalSlug })
			.where(eq(schema.CategoriesTable.id, cat.id));
		console.log(`  "${cat.name}": "${cat.slug}" → "${finalSlug}"`);
	}

	console.log("Fixing brand slugs...");
	const brands = await db.query.BrandsTable.findMany();
	const usedBrandSlugs = new Set(brands.map((b) => b.slug).filter(Boolean));

	for (const brand of brands) {
		const newSlug = slugify(brand.name);
		if (brand.slug === newSlug) continue; // already ASCII

		let finalSlug = newSlug;
		let counter = 1;
		while (usedBrandSlugs.has(finalSlug)) {
			finalSlug = `${newSlug}-${counter}`;
			counter++;
		}
		usedBrandSlugs.add(finalSlug);
		usedBrandSlugs.delete(brand.slug); // free up old slug

		await db.update(schema.BrandsTable)
			.set({ slug: finalSlug })
			.where(eq(schema.BrandsTable.id, brand.id));
		console.log(`  "${brand.name}": "${brand.slug}" → "${finalSlug}"`);
	}

	await client.end();
	console.log("Done! All slugs are now ASCII-only.");
}

fixSlugs().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
