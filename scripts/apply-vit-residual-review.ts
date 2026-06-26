import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import postgres from "postgres";

loadDotEnv({ path: ".env" });

type ExtractedProduct = {
	brandName: string;
	productName: string;
	price: number | null;
	priceText: string | null;
	variant: string | null;
	sizeOrCount: string | null;
	sourceImages: string[];
	aliases: string[];
	confidence: number;
	canonicalKey: string;
};

type MatchRecord = {
	score: number;
	extracted: ExtractedProduct;
	db: {
		id: number;
		name: string;
		price: number;
		status: string;
		brandName: string;
	};
	priceDelta: number | null;
};

type DiffReport = {
	extractedOnly: ExtractedProduct[];
	possibleMatches: MatchRecord[];
};

type Brand = {
	id: number;
	name: string;
	slug: string;
	deletedAt?: Date | string | null;
};

type AddCandidate = {
	brandName: string;
	name: string;
	price: number;
	amount: string;
	potency: string;
	categoryId: number;
	description: string;
	tags: string[];
	confidence: number;
	source: string;
	reviewSource: string;
};

const reportPath = path.resolve(
	process.argv[2] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/post-manual-apply/products-vs-db.report.json",
);
const outputDir = path.resolve(
	process.argv[3] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/residual-review",
);

const extractedOnlyAddIndices = [
	2, 3, 4, 7, 12, 13, 14, 16, 17, 18, 21, 23, 24, 25, 26, 27, 29, 30, 33,
	34, 35, 36, 37, 42, 43, 47, 48, 49, 50, 52, 54, 55,
];
const possibleAddIndices = [49, 50, 52, 54, 56, 58, 59];
const clearPriceCorrections = [
	{
		productId: 7382,
		oldPrice: 80_000,
		newPrice: 100_000,
		reason:
			"Herbamama Sea Moss and Bladderwrack capsules were previously conflated with a gummies extraction.",
	},
];

const categoryIds = {
	beauty: 490,
	bComplex: 491,
	vitaminC: 492,
	vitaminD: 493,
	gut: 494,
	immune: 495,
	general: 496,
	joint: 497,
	mineral: 498,
	sleep: 499,
	omega: 500,
	sport: 501,
	brain: 502,
	herbal: 503,
	kids: 504,
	liver: 505,
	women: 506,
	men: 507,
};

// Empty string = no logo. Storefront renders a monogram fallback.
// Never use an external placeholder URL — see GitHub issue #11.
const defaultBrandLogoUrl = "";

await mkdir(outputDir, { recursive: true });

const report = JSON.parse(await readFile(reportPath, "utf8")) as DiffReport;
const sql = postgres(getDbUrl(), { ssl: "require", max: 1, fetch_types: false });

try {
	const candidates = dedupeAddCandidates([
		...extractedOnlyAddIndices.map((index) =>
			fromExtractedProduct(report.extractedOnly[index], `extractedOnly[${index}]`),
		),
		...possibleAddIndices.map((index) =>
			fromExtractedProduct(
				report.possibleMatches[index].extracted,
				`possibleMatches[${index}]`,
			),
		),
	]);

	const brands = await loadBrands(sql);
	const existingProducts = await loadProducts(sql);
	const existingKeys = new Set(
		existingProducts.map((product) =>
			productKey(product.brandName, product.name),
		),
	);

	const audit = {
		generatedAt: new Date().toISOString(),
		reportPath,
		reviewed: {
			extractedOnly: report.extractedOnly.length,
			possibleMatches: report.possibleMatches.length,
			selectedExtractedOnly: extractedOnlyAddIndices,
			selectedPossibleMatches: possibleAddIndices,
		},
		priceCorrections: clearPriceCorrections,
		addCandidates: candidates,
		createdProducts: [] as Array<{
			id: number;
			brandName: string;
			name: string;
			price: number;
			status: string;
			reviewSource: string;
		}>,
		skippedAdds: [] as Array<{ candidate: AddCandidate; reason: string }>,
	};

	await sql.begin(async (tx) => {
		for (const correction of clearPriceCorrections) {
			await tx`
				update ecom_vit_product
				set price = ${correction.newPrice}, updated_at = now()
				where id = ${correction.productId}
					and deleted_at is null
					and price = ${correction.oldPrice}
			`;
		}

		for (const candidate of candidates) {
			const key = productKey(candidate.brandName, candidate.name);
			if (existingKeys.has(key)) {
				audit.skippedAdds.push({ candidate, reason: "Exact brand/name duplicate" });
				continue;
			}

			const brand = await resolveOrCreateBrand(tx, brands, candidate.brandName);
			const slug = await uniqueProductSlug(tx, candidate.name);
			const [created] = await tx<{
				id: number;
				name: string;
				price: number;
				status: string;
			}[]>`
				insert into ecom_vit_product (
					name,
					slug,
					description,
					status,
					discount,
					amount,
					potency,
					stock,
					price,
					daily_intake,
					category_id,
					brand_id,
					tags,
					ingredients,
					name_mn,
					seo_title,
					seo_description,
					weight_grams,
					created_at,
					updated_at
				)
				values (
					${candidate.name},
					${slug},
					${candidate.description},
					'draft',
					0,
					${candidate.amount},
					${candidate.potency},
					0,
					${candidate.price},
					0,
					${candidate.categoryId},
					${brand.id},
					${JSON.stringify(candidate.tags)}::jsonb,
					${JSON.stringify([])}::jsonb,
					null,
					${candidate.name},
					${candidate.description.slice(0, 512)},
					0,
					now(),
					now()
				)
				returning id, name, price, status
			`;

			existingKeys.add(key);
			audit.createdProducts.push({
				id: created.id,
				brandName: brand.name,
				name: created.name,
				price: created.price,
				status: created.status,
				reviewSource: candidate.reviewSource,
			});
		}
	});

	const auditPath = path.join(
		outputDir,
		`residual-review-applied.${new Date()
			.toISOString()
			.replace(/[:.]/g, "-")}.json`,
	);
	await writeTextAtomic(auditPath, `${JSON.stringify(audit, null, 2)}\n`);

	console.log(
		JSON.stringify(
			{
				reviewedExtractedOnly: report.extractedOnly.length,
				reviewedPossibleMatches: report.possibleMatches.length,
				selectedCandidates: candidates.length,
				createdProducts: audit.createdProducts.length,
				skippedAdds: audit.skippedAdds.length,
				priceCorrections: clearPriceCorrections.length,
				auditPath,
			},
			null,
			2,
		),
	);
} finally {
	await sql.end({ timeout: 5 });
}

function fromExtractedProduct(
	product: ExtractedProduct,
	reviewSource: string,
): AddCandidate {
	if (!product) throw new Error(`Missing product at ${reviewSource}`);
	const brandName = canonicalBrandName(product.brandName);
	const name = fullName(brandName, product.productName, [
		product.variant,
		product.sizeOrCount,
	]);
	return {
		brandName,
		name,
		price: product.price ?? 0,
		amount: cleanAmount(product.sizeOrCount),
		potency: cleanPotency(product.variant, product.sizeOrCount),
		categoryId: inferCategoryId(name),
		description: `Draft product created from residual VIT manual review. Source: ${reviewSource}. Source images: ${product.sourceImages.join(", ")}`,
		tags: ["vit-image-import", "vit-residual-review"],
		confidence: product.confidence,
		source: product.sourceImages[0] ?? "vit-residual-review",
		reviewSource,
	};
}

function dedupeAddCandidates(candidates: AddCandidate[]): AddCandidate[] {
	const deduped = new Map<string, AddCandidate>();

	for (const candidate of candidates) {
		if (!candidate.brandName || !candidate.name || candidate.price < 20_000) {
			continue;
		}
		const key = productKey(candidate.brandName, candidate.name);
		const existing = deduped.get(key);
		if (!existing || candidate.confidence > existing.confidence) {
			deduped.set(key, candidate);
		}
	}

	return Array.from(deduped.values()).sort((left, right) =>
		`${left.brandName} ${left.name}`.localeCompare(
			`${right.brandName} ${right.name}`,
		),
	);
}

async function loadProducts(sql: postgres.Sql) {
	return sql<Array<{ name: string; brandName: string }>>`
		select p.name, coalesce(b.name, '') as "brandName"
		from ecom_vit_product p
		left join ecom_vit_brand b on b.id = p.brand_id
		where p.deleted_at is null
	`;
}

async function loadBrands(sql: postgres.Sql): Promise<Map<string, Brand>> {
	const rows = await sql<Brand[]>`
		select id, name, slug, deleted_at as "deletedAt"
		from ecom_vit_brand
	`;
	return new Map(rows.map((brand) => [brandKey(brand.name), brand]));
}

async function resolveOrCreateBrand(
	sql: postgres.Sql,
	brands: Map<string, Brand>,
	brandName: string,
): Promise<Brand> {
	const key = brandKey(brandName);
	const existing = brands.get(key);
	if (existing) {
		if (existing.deletedAt) {
			await sql`
				update ecom_vit_brand
				set deleted_at = null, updated_at = now()
				where id = ${existing.id}
			`;
			existing.deletedAt = null;
		}
		return existing;
	}

	const slug = await uniqueBrandSlug(sql, brandName);
	const [created] = await sql<Brand[]>`
		insert into ecom_vit_brand (
			name,
			slug,
			logo_url,
			description,
			seo_title,
			seo_description,
			created_at,
			updated_at
		)
		values (
			${brandName},
			${slug},
			${defaultBrandLogoUrl},
			${`${brandName} supplement products.`},
			${brandName},
			${`${brandName} supplement products.`},
			now(),
			now()
		)
		returning id, name, slug
	`;
	brands.set(key, created);
	return created;
}

async function uniqueBrandSlug(sql: postgres.Sql, brandName: string): Promise<string> {
	return uniqueSlug(sql, "ecom_vit_brand", slugify(brandName));
}

async function uniqueProductSlug(sql: postgres.Sql, name: string): Promise<string> {
	return uniqueSlug(sql, "ecom_vit_product", slugify(name));
}

async function uniqueSlug(
	sql: postgres.Sql,
	tableName: "ecom_vit_brand" | "ecom_vit_product",
	baseSlug: string,
): Promise<string> {
	let slug = baseSlug;
	let suffix = 2;
	while (true) {
		const rows =
			tableName === "ecom_vit_brand"
				? await sql`select id from ecom_vit_brand where slug = ${slug} limit 1`
				: await sql`select id from ecom_vit_product where slug = ${slug} limit 1`;
		if (rows.length === 0) return slug;
		slug = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

function fullName(
	brandName: string,
	productName: string,
	details: Array<string | null>,
): string {
	return compact(
		[brandName, stripLeadingBrand(productName, brandName), ...details]
			.filter((part): part is string => !!part && part.trim().length > 0)
			.join(" "),
	).slice(0, 256);
}

// The extracted productName sometimes already starts with the brand
// (e.g. "Micro Ingredients Vitamin D3 ..."). Stripping a single leading
// brand prefix before we prepend the brand prevents the duplicated-brand
// name bug (issue #78).
function stripLeadingBrand(productName: string, brandName: string): string {
	const productNorm = productName.replace(/\s+/g, " ").trim();
	const brandNorm = brandName.replace(/\s+/g, " ").trim();
	if (!brandNorm) return productName;
	const prefix = `${brandNorm} `;
	if (productNorm.toLowerCase().startsWith(prefix.toLowerCase())) {
		return productNorm.slice(prefix.length);
	}
	return productName;
}

function cleanAmount(value: string | null): string {
	const normalized = compact(value ?? "1 unit");
	return normalized.length >= 3 ? normalized.slice(0, 256) : "1 unit";
}

function cleanPotency(variant: string | null, sizeOrCount: string | null): string {
	const combined = compact(
		[variant, extractPotency(sizeOrCount)].filter(Boolean).join(" "),
	);
	return combined.length >= 2 ? combined.slice(0, 256) : "N/A";
}

function extractPotency(value: string | null): string {
	if (!value) return "";
	const matches = value.match(
		/\b\d[\d,.]*\s*(?:iu|mcg|mg|g|billion cfu|million afu|afu|gdu)\b/gi,
	);
	return matches ? matches.join(" ") : "";
}

function inferCategoryId(text: string): number {
	const normalized = normalize(text);
	if (/\b(kid|kids|children|child|baby|teen|tall)\b/.test(normalized)) {
		return categoryIds.kids;
	}
	if (/\b(women|woman|female|pregno|d chiro|myo|folate|chasteberry|boric|vaginal|prenatal)\b/.test(normalized)) {
		return categoryIds.women;
	}
	if (/\b(d3|vitamin d|k2)\b/.test(normalized)) return categoryIds.vitaminD;
	if (/\b(vitamin c|ascorbic|quercetin|elderberry|c 1000)\b/.test(normalized)) {
		return categoryIds.vitaminC;
	}
	if (/\b(b12|b6|folate|methylfolate|b complex|biotin|niacinamide)\b/.test(normalized)) {
		return categoryIds.bComplex;
	}
	if (/\b(magnesium|zinc|copper|iodine|selenium|iron|boron|potassium)\b/.test(normalized)) {
		return categoryIds.mineral;
	}
	if (/\b(probiotic|prebiotic|inulin|dgl|digest|enzyme|akkermansia|d mannose)\b/.test(normalized)) {
		return categoryIds.gut;
	}
	if (/\b(omega|fish oil|dha|epa|primrose|black seed|mct|oregano oil|krill)\b/.test(normalized)) {
		return categoryIds.omega;
	}
	if (/\b(collagen|glucosamine|chondroitin|msm|hyaluronic|joint)\b/.test(normalized)) {
		return categoryIds.joint;
	}
	if (/\b(melatonin|theanine|calm|stress|sleep)\b/.test(normalized)) {
		return categoryIds.sleep;
	}
	if (/\b(nmn|brain|focus|choline|citicoline|pterostilbene|lutein|ginkgo|lion)\b/.test(normalized)) {
		return categoryIds.brain;
	}
	if (/\b(tudca|milk thistle|liver|detox|spirulina|chlorella)\b/.test(normalized)) {
		return categoryIds.liver;
	}
	if (/\b(hair|skin|nails|castor|tocotrienol|tocopherol)\b/.test(normalized)) {
		return categoryIds.beauty;
	}
	if (/\b(herb|root|extract|ashwagandha|turmeric|mullein|apricot|mushroom|reishi|bromelain|slippery elm)\b/.test(normalized)) {
		return categoryIds.herbal;
	}
	if (/\b(carnitine|arginine|glutamine|protein|sport)\b/.test(normalized)) {
		return categoryIds.sport;
	}
	if (/\b(immune|zinc|sea moss)\b/.test(normalized)) return categoryIds.immune;
	return categoryIds.general;
}

function canonicalBrandName(value: string): string {
	const normalized = compact(value);
	const key = brandKey(normalized);
	const aliases = new Map<string, string>([
		["cflihtc", "Cfilihtc"],
		["cfilihtc", "Cfilihtc"],
		["doctor s best", "Doctor's Best"],
		["doctors best", "Doctor's Best"],
		["dr mercola", "Dr Mercola"],
		["herbamama", "Herbamama"],
		["microingredients", "Micro Ingredients"],
		["micro ingredients", "Micro Ingredients"],
		["naturebell", "Naturebell"],
		["nature bell", "Naturebell"],
		["now", "Now"],
		["now foods", "Now"],
		["nordic naturals", "Nordic Naturals"],
		["zazzee naturals", "Zazzee Naturals"],
	]);
	return aliases.get(key) ?? normalized;
}

function productKey(brandName: string, productName: string): string {
	return normalize(`${brandName} ${productName}`);
}

function brandKey(brandName: string): string {
	return normalize(brandName);
}

function slugify(value: string): string {
	return (
		normalize(value)
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 220) || "vit-product"
	);
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

function compact(value: string): string {
	return value.replace(/\s+/g, " ").trim();
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

	throw new Error(
		"DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env",
	);
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
