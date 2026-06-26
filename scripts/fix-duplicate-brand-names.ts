#!/usr/bin/env bun
/**
 * One-time backfill for issue #78: product names with a duplicated leading
 * brand prefix (e.g. "Micro Ingredients Micro Ingredients Vitamin D3 ...").
 *
 * What it does, per product:
 *   1. Detects a duplicated leading brand prefix in `name`
 *      (name starts with `<brand> <brand> `, case-insensitive).
 *   2. Strips ONE copy of the leading brand prefix from `name`.
 *   3. Records the current `slug` into the `old_slugs` jsonb column (so the
 *      storefront can 301-redirect old URLs to the new canonical one).
 *   4. Regenerates `slug` from the cleaned `name` (same slugify the import
 *      pipeline uses), ensuring uniqueness across products.
 *
 * Dry-run by default. Apply with `--yes`.
 *
 * Usage:
 *   bun run scripts/fix-duplicate-brand-names.ts            # preview
 *   bun run scripts/fix-duplicate-brand-names.ts --yes      # apply
 *
 * Requires DIRECT_DB_URL or PLANETSCALE_* env vars (loaded from .env).
 */
import { config as loadDotEnv } from "dotenv";
import postgres from "postgres";

loadDotEnv({ path: ".env" });

type ProductRow = {
	id: number;
	name: string;
	slug: string;
	brandName: string;
	oldSlugs: string[] | null;
};

const apply = process.argv.includes("--yes");

const sql = postgres(getDbUrl(), { ssl: "require", max: 1, fetch_types: false });

try {
	const products = await sql<ProductRow[]>`
		select
			p.id,
			p.name,
			p.slug,
			coalesce(b.name, '') as "brandName",
			p.old_slugs as "oldSlugs"
		from ecom_vit_product p
		left join ecom_vit_brand b on b.id = p.brand_id
		where p.deleted_at is null
	`;

	const candidates = products
		.map((p) => ({
			product: p,
			cleanedName: stripDuplicatedBrandPrefix(p.name, p.brandName),
		}))
		.filter((c): c is { product: ProductRow; cleanedName: string } => c.cleanedName !== null);

	if (candidates.length === 0) {
		console.log("✅ No products with a duplicated leading brand prefix found.");
		await sql.end({ timeout: 5 });
		process.exit(0);
	}

	// Pre-compute new slugs with uniqueness across ALL products (so a cleaned
	// slug never collides with another product's existing or new slug).
	const takenSlugs = new Set(
		products
			.filter((p) => !candidates.some((c) => c.product.id === p.id))
			.map((p) => p.slug),
	);
	const planned: Array<{
		id: number;
		brandName: string;
		oldName: string;
		newName: string;
		oldSlug: string;
		newSlug: string;
		oldSlugs: string[];
	}> = [];

	for (const { product, cleanedName } of candidates) {
		const newSlug = uniqueProductSlug(slugify(cleanedName), takenSlugs);
		takenSlugs.add(newSlug);
		const oldSlugs = dedupeOldSlugs(product.oldSlugs ?? [], product.slug, newSlug);
		planned.push({
			id: product.id,
			brandName: product.brandName,
			oldName: product.name,
			newName: cleanedName,
			oldSlug: product.slug,
			newSlug,
			oldSlugs,
		});
	}

	console.log(
		`Found ${planned.length} product(s) with a duplicated leading brand prefix.\n`,
	);
	for (const p of planned) {
		console.log(`ID ${p.id} [${p.brandName}]`);
		console.log(`  name: ${p.oldName}`);
		console.log(`  →    ${p.newName}`);
		console.log(`  slug: ${p.oldSlug} → ${p.newSlug}`);
		console.log(`  old_slugs: ${JSON.stringify(p.oldSlugs)}\n`);
	}

	if (!apply) {
		console.log("Dry-run only. To apply, run with --yes.");
		await sql.end({ timeout: 5 });
		process.exit(0);
	}

	console.log("🔧 Applying changes in a single transaction...");
	let updated = 0;
	await sql.begin(async (tx) => {
		for (const p of planned) {
			await tx`
				update ecom_vit_product
				set name = ${p.newName},
				    slug = ${p.newSlug},
				    old_slugs = ${JSON.stringify(p.oldSlugs)}::jsonb,
				    updated_at = now()
				where id = ${p.id} and deleted_at is null
			`;
			updated++;
		}
	});

	console.log(`\n✅ Updated ${updated} product(s).`);
	console.log("Next steps:");
	console.log("  1. Apply the migration: bun run db:migrate");
	console.log("  2. Rebuild the storefront: cd apps/storev2 && bun run build");
	console.log("  3. Redeploy so old-slug 301 redirects are prerendered.");
	await sql.end({ timeout: 5 });
} catch (err) {
	console.error("❌ Error:", err);
	await sql.end({ timeout: 5 }).catch(() => {});
	process.exit(1);
}

/**
 * Returns the cleaned name with ONE leading brand prefix removed, or null if
 * `name` does not start with a duplicated `<brand> <brand> ` prefix.
 */
function stripDuplicatedBrandPrefix(name: string, brandName: string): string | null {
	const nameNorm = name.replace(/\s+/g, " ").trim();
	const brandNorm = brandName.replace(/\s+/g, " ").trim();
	if (!brandNorm) return null;

	const doublePrefix = `${brandNorm} ${brandNorm}`;
	if (!nameNorm.toLowerCase().startsWith(doublePrefix.toLowerCase())) return null;

	// Remove the first `<brand> ` occurrence, keeping the second brand copy
	// (and the rest of the name) in its original casing.
	return nameNorm.slice(brandNorm.length + 1);
}

function dedupeOldSlugs(
	existing: string[],
	oldSlug: string,
	newSlug: string,
): string[] {
	if (oldSlug === newSlug) return existing;
	const next = existing.includes(oldSlug) ? existing : [...existing, oldSlug];
	return next.filter((s) => s !== newSlug);
}

function uniqueProductSlug(base: string, taken: Set<string>): string {
	let slug = base;
	let suffix = 2;
	while (taken.has(slug)) {
		slug = `${base}-${suffix}`;
		suffix++;
	}
	return slug;
}

// Mirrors the import pipeline (apply-vit-manual-candidates.ts) so regenerated
// slugs stay consistent with how products are initially created.
function slugify(value: string): string {
	return normalize(value)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 220) || "vit-product";
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function getDbUrl(): string {
	if (process.env.DIRECT_DB_URL) return process.env.DIRECT_DB_URL;

	if (
		process.env.PLANETSCALE_USER &&
		process.env.PLANETSCALE_PASSWORD &&
		process.env.PLANETSCALE_HOST &&
		process.env.PLANETSCALE_DATABASE
	) {
		return `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
	}

	throw new Error("DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env");
}
