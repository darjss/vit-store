import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type ProductImage = { url: string; isPrimary?: boolean };
type Product = {
	sourceId: number;
	name: string;
	brand: string;
	amount: string;
	potency: string;
	price: number;
	description?: string;
	images?: ProductImage[];
};

type ProductFile = { generatedAt: string; count: number; products: Product[] };

const STOPWORDS = new Set([
	"dietary",
	"supplement",
	"supplements",
	"capsule",
	"capsules",
	"softgel",
	"softgels",
	"tablet",
	"tablets",
	"gummy",
	"gummies",
	"with",
	"and",
	"plus",
	"for",
	"the",
	"a",
	"an",
	"of",
	"per",
	"serving",
	"servings",
	"made",
	"formula",
	"high",
	"strength",
	"maximum",
	"support",
]);

const normalize = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[’']/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const tokenizeName = (name: string, brand: string): string[] => {
	const brandWords = new Set(normalize(brand).split(" ").filter(Boolean));
	return normalize(name)
		.split(" ")
		.filter((t) => t.length > 1)
		.filter((t) => !STOPWORDS.has(t))
		.filter((t) => !brandWords.has(t))
		.filter((t) => !/^\d+$/.test(t));
};

const jaccard = (a: string[], b: string[]): number => {
	const A = new Set(a);
	const B = new Set(b);
	if (A.size === 0 || B.size === 0) return 0;
	let inter = 0;
	for (const x of A) if (B.has(x)) inter++;
	const union = A.size + B.size - inter;
	return union === 0 ? 0 : inter / union;
};

const extractCount = (p: Product): string => {
	const text = `${p.amount ?? ""} ${p.name ?? ""}`.toLowerCase();
	const m = text.match(
		/(\d{1,4})\s*(capsules?|caps|softgels?|soft gels?|tablets?|tabs?|gummies?)/,
	);
	if (!m) return "";
	const n = m[1];
	const raw = m[2] ?? "";
	const unit = /soft/.test(raw)
		? "softgels"
		: /tablet|tabs?/.test(raw)
			? "tablets"
			: /gumm/.test(raw)
				? "gummies"
				: "capsules";
	return `${n}-${unit}`;
};

const normalizePotency = (p: Product): string =>
	String(p.potency ?? "")
		.toLowerCase()
		.replace(/мг/g, "mg")
		.replace(/мкг/g, "mcg")
		.replace(/\s+/g, " ")
		.trim();

const scoreProduct = (p: Product): number => {
	const images = Array.isArray(p.images) ? p.images : [];
	const cdn = images.filter((i) => i.url.includes("cdn.darjs.dev")).length;
	const amazon = images.filter((i) =>
		i.url.includes("m.media-amazon.com"),
	).length;
	return (
		cdn * 10 + images.length * 2 + (p.description?.length ?? 0) / 50 - amazon
	);
};

function main() {
	const raw = JSON.parse(readFileSync("products.json", "utf-8")) as ProductFile;
	const products = raw.products;

	const buckets = new Map<string, Product[]>();
	for (const p of products) {
		const brand = normalize(p.brand ?? "");
		const count = extractCount(p);
		const potency = normalizePotency(p);
		if (!brand || !count || !potency) continue;
		const key = `${brand}|${count}|${potency}|${p.price}`;
		const arr = buckets.get(key) ?? [];
		arr.push(p);
		buckets.set(key, arr);
	}

	const toDelete = new Set<number>();
	const groups: Array<{
		key: string;
		kept: number;
		deleted: number[];
		items: Array<{ sourceId: number; name: string }>;
	}> = [];

	for (const [key, arr] of buckets.entries()) {
		if (arr.length < 2) continue;
		const parent = Array.from({ length: arr.length }, (_, i) => i);
		const find = (x: number): number => {
			if (parent[x] !== x) parent[x] = find(parent[x]!);
			return parent[x]!;
		};
		const unite = (a: number, b: number) => {
			const ra = find(a);
			const rb = find(b);
			if (ra !== rb) parent[rb] = ra;
		};

		for (let i = 0; i < arr.length; i++) {
			for (let j = i + 1; j < arr.length; j++) {
				const a = arr[i]!;
				const b = arr[j]!;
				const na = normalize(a.name);
				const nb = normalize(b.name);
				const sim = jaccard(
					tokenizeName(a.name, a.brand),
					tokenizeName(b.name, b.brand),
				);
				const contains = na.includes(nb) || nb.includes(na);
				if (contains || sim >= 0.42) unite(i, j);
			}
		}

		const clusters = new Map<number, Product[]>();
		for (let i = 0; i < arr.length; i++) {
			const root = find(i);
			const list = clusters.get(root) ?? [];
			list.push(arr[i]!);
			clusters.set(root, list);
		}

		for (const cluster of clusters.values()) {
			if (cluster.length < 2) continue;
			const keep = cluster
				.slice()
				.sort((a, b) => scoreProduct(b) - scoreProduct(a))[0]!;
			const deleted = cluster
				.filter((p) => p.sourceId !== keep.sourceId)
				.map((p) => p.sourceId);
			if (deleted.length === 0) continue;
			for (const id of deleted) toDelete.add(id);
			groups.push({
				key,
				kept: keep.sourceId,
				deleted,
				items: cluster.map((p) => ({ sourceId: p.sourceId, name: p.name })),
			});
		}
	}

	const before = products.length;
	const kept = products.filter((p) => !toDelete.has(p.sourceId));
	raw.products = kept;
	raw.count = kept.length;
	raw.generatedAt = new Date().toISOString();

	writeFileSync("products.json", `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
	mkdirSync("generated", { recursive: true });
	writeFileSync(
		"generated/dedupe-review-report-pass2.json",
		`${JSON.stringify(
			{
				runAt: new Date().toISOString(),
				before,
				after: kept.length,
				removedCount: toDelete.size,
				removedSourceIds: Array.from(toDelete).sort((a, b) => a - b),
				groups,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	console.log(
		JSON.stringify(
			{
				before,
				after: kept.length,
				removedCount: toDelete.size,
			},
			null,
			2,
		),
	);
}

main();
