import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type ProductImage = { url: string; isPrimary?: boolean };

type Product = {
	sourceId: number;
	name: string;
	slug: string;
	brand: string;
	amount: string;
	potency: string;
	price: number;
	description?: string;
	seoDescription?: string;
	images?: ProductImage[];
	[key: string]: unknown;
};

type ProductFile = {
	generatedAt: string;
	count: number;
	products: Product[];
};

type CandidateGroup = {
	key: string;
	products: Product[];
};

const STOPWORDS = new Set([
	"dietary",
	"supplement",
	"supplements",
	"capsule",
	"capsules",
	"cap",
	"caps",
	"softgel",
	"softgels",
	"tablet",
	"tablets",
	"gummy",
	"gummies",
	"serving",
	"servings",
	"with",
	"without",
	"and",
	"plus",
	"for",
	"the",
	"a",
	"an",
	"of",
	"per",
	"pack",
	"mg",
	"mcg",
	"iu",
	"oz",
	"ml",
]);

function normalizeText(input: string): string {
	return input
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractCountUnit(input: string): string {
	const t = input.toLowerCase();
	const m = t.match(
		/(\d{1,4})\s*(capsules?|caps|softgels?|soft gels?|tablets?|tabs?|gummies?|gummy)/,
	);
	if (!m) return "";
	const num = m[1];
	const raw = m[2] ?? "";
	let unit = "";
	if (/capsule|caps\b/.test(raw)) unit = "capsules";
	else if (/soft/.test(raw)) unit = "softgels";
	else if (/tablet|tabs\b/.test(raw)) unit = "tablets";
	else if (/gumm/.test(raw)) unit = "gummies";
	return `${num}-${unit}`;
}

function normalizePotency(input: string): string {
	const t = input
		.toLowerCase()
		.replace(/мг/g, "mg")
		.replace(/мкг/g, "mcg")
		.replace(/\s+/g, " ")
		.trim();
	if (!t || ["n/a", "na", "unknown", "varied", "not applicable"].includes(t)) {
		return "";
	}
	return t
		.replace(/[^a-z0-9%+.,\- ]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function nameTokens(name: string, brand: string): Set<string> {
	const brandWords = normalizeText(brand).split(" ").filter(Boolean);
	const tokens = normalizeText(name)
		.split(" ")
		.filter((w) => w.length > 1)
		.filter((w) => !STOPWORDS.has(w))
		.filter((w) => !/^\d+$/.test(w))
		.filter((w) => !brandWords.includes(w));
	return new Set(tokens);
}

function similarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

function sameProductName(a: Product, b: Product): boolean {
	const normA = normalizeText(a.name);
	const normB = normalizeText(b.name);
	if (normA === normB) return true;
	const ta = nameTokens(a.name, a.brand);
	const tb = nameTokens(b.name, b.brand);
	const score = similarity(ta, tb);
	let inter = 0;
	for (const x of ta) if (tb.has(x)) inter++;
	const overlapA = ta.size === 0 ? 0 : inter / ta.size;
	const overlapB = tb.size === 0 ? 0 : inter / tb.size;
	return score >= 0.58 || (inter >= 4 && overlapA >= 0.72 && overlapB >= 0.72);
}

function imageQualityScore(p: Product): number {
	const images = Array.isArray(p.images) ? p.images : [];
	const total = images.length;
	const cdn = images.filter((i) => i.url.includes("cdn.darjs.dev")).length;
	const amazon = images.filter((i) =>
		i.url.includes("m.media-amazon.com"),
	).length;
	return cdn * 8 + total * 2 - amazon;
}

function chooseBest(products: Product[]): Product {
	return products.slice().sort((a, b) => {
		const scoreA =
			imageQualityScore(a) +
			(a.description?.length ?? 0) / 40 +
			(a.seoDescription?.length ?? 0) / 80;
		const scoreB =
			imageQualityScore(b) +
			(b.description?.length ?? 0) / 40 +
			(b.seoDescription?.length ?? 0) / 80;
		if (scoreA !== scoreB) return scoreB - scoreA;
		return a.sourceId - b.sourceId;
	})[0]!;
}

function clusterSimilar(products: Product[]): Product[][] {
	const n = products.length;
	const parent = Array.from({ length: n }, (_, i) => i);
	const find = (x: number): number => {
		if (parent[x] !== x) parent[x] = find(parent[x]!);
		return parent[x]!;
	};
	const unite = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[rb] = ra;
	};

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (sameProductName(products[i]!, products[j]!)) unite(i, j);
		}
	}

	const byRoot = new Map<number, Product[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		const arr = byRoot.get(r) ?? [];
		arr.push(products[i]!);
		byRoot.set(r, arr);
	}
	return Array.from(byRoot.values()).filter((g) => g.length > 1);
}

function main() {
	const root = process.cwd();
	const jsonPath = resolve(root, "products.json");
	const reportDir = resolve(root, "generated");
	const reportPath = resolve(reportDir, "dedupe-report.json");

	const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as ProductFile;
	const products = raw.products;

	const grouped = new Map<string, Product[]>();
	for (const p of products) {
		const brand = normalizeText(p.brand || "");
		const count = extractCountUnit(`${p.amount || ""} ${p.name || ""}`);
		const potency = normalizePotency(p.potency || "");
		if (!brand || !count || !potency) continue;
		const key = `${brand}|${count}|${potency}`;
		const arr = grouped.get(key) ?? [];
		arr.push(p);
		grouped.set(key, arr);
	}

	const candidateGroups: CandidateGroup[] = Array.from(grouped.entries())
		.filter(([, arr]) => arr.length > 1)
		.map(([key, arr]) => ({ key, products: arr }));

	const deleteIds = new Set<number>();
	const autoDeletedGroups: Array<{
		key: string;
		kept: number;
		deleted: number[];
		price: number;
		names: string[];
	}> = [];
	const flaggedGroups: Array<{
		key: string;
		items: Array<{
			sourceId: number;
			price: number;
			name: string;
			slug: string;
		}>;
	}> = [];

	for (const group of candidateGroups) {
		const clusters = clusterSimilar(group.products);
		for (const cluster of clusters) {
			const prices = new Set(cluster.map((p) => p.price));
			if (prices.size === 1) {
				const keep = chooseBest(cluster);
				const deleted = cluster
					.filter((p) => p.sourceId !== keep.sourceId)
					.map((p) => p.sourceId);
				for (const id of deleted) deleteIds.add(id);
				if (deleted.length > 0) {
					autoDeletedGroups.push({
						key: group.key,
						kept: keep.sourceId,
						deleted,
						price: keep.price,
						names: cluster.map((p) => p.name),
					});
				}
			} else {
				flaggedGroups.push({
					key: group.key,
					items: cluster.map((p) => ({
						sourceId: p.sourceId,
						price: p.price,
						name: p.name,
						slug: p.slug,
					})),
				});
			}
		}
	}

	const deduped = products.filter((p) => !deleteIds.has(p.sourceId));
	const output: ProductFile = {
		generatedAt: new Date().toISOString(),
		count: deduped.length,
		products: deduped,
	};

	writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
	mkdirSync(reportDir, { recursive: true });
	writeFileSync(
		reportPath,
		`${JSON.stringify(
			{
				runAt: new Date().toISOString(),
				inputCount: products.length,
				outputCount: deduped.length,
				autoDeletedCount: deleteIds.size,
				autoDeletedSourceIds: Array.from(deleteIds).sort((a, b) => a - b),
				autoDeletedGroups,
				flaggedForReviewCount: flaggedGroups.length,
				flaggedGroups,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	console.log(
		JSON.stringify(
			{
				inputCount: products.length,
				outputCount: deduped.length,
				autoDeletedCount: deleteIds.size,
				flaggedForReviewCount: flaggedGroups.length,
				reportPath,
			},
			null,
			2,
		),
	);
}

main();
