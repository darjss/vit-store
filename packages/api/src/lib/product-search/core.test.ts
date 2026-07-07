import { describe, expect, test } from "bun:test";
import {
	buildProductSearchDocument,
	buildProductSearchSnapshot,
	hydrateProductSearchSnapshot,
	searchMiniSearchIndex,
} from "./core";
import type { ProductSearchSourceDocument } from "./types";

const source: ProductSearchSourceDocument[] = [
	{
		id: 1,
		name: "Naturebell, D3 + K2, 10,000 IU D3 & 200 mcg K2, 240 Softgels",
		nameMn: null,
		slug: "naturebell-d3-k2-10000",
		price: 100,
		brand: "Naturebell",
		category: "Vitamins",
		status: "active",
		stock: 3,
		amount: "10,000 IU",
		potency: "10,000 IU",
	},
	{
		id: 2,
		name: "Now Foods, Vitamin D3, 50,000 IU, 50 Softgels",
		nameMn: null,
		slug: "now-d3-50000",
		price: 90,
		brand: "Now Foods",
		category: "Vitamins",
		status: "active",
		stock: 16,
		amount: "50,000 IU",
		potency: "50,000 IU",
	},
	{
		id: 3,
		name: "Nature Made, Vitamin D3, 5,000 IU, 100 Softgels",
		nameMn: null,
		slug: "naturemade-d3-5000",
		price: 80,
		brand: "Nature Made",
		category: "Vitamins",
		status: "active",
		stock: 50,
		amount: "5,000 IU",
		potency: "5,000 IU",
	},
	{
		id: 4,
		name: "Nature's Plus, Source of Life, Multivitamin",
		nameMn: null,
		slug: "natures-plus-source-of-life",
		price: 120,
		brand: "Nature's Plus",
		category: "Vitamins",
		status: "active",
		stock: 20,
	},
	{
		id: 5,
		name: "Now Foods, Vitamin C, 1,000 mg, 100 Tablets",
		nameMn: null,
		slug: "now-vitamin-c-1000",
		price: 40,
		brand: "Now Foods",
		category: "Vitamins",
		status: "active",
		stock: 30,
		amount: "1,000 mg",
		potency: "1,000 mg",
	},
	{
		id: 6,
		name: "Silverpeaks Height Growth",
		nameMn: null,
		slug: "silverpeaks-height-growth",
		price: 60,
		brand: "Silverpeaks",
		category: "Supplements",
		status: "active",
		stock: 10,
	},
];

const buildIndex = () => {
	const documents = source.map(buildProductSearchDocument);
	const snapshot = buildProductSearchSnapshot(documents);
	return hydrateProductSearchSnapshot(snapshot);
};

const search = (query: string, limit = 8) => {
	const { miniSearch, documentsById } = buildIndex();
	return searchMiniSearchIndex(miniSearch, documentsById, query, limit);
};

const topIds = (query: string, limit = 8) =>
	search(query, limit).map((r) => r.id);

describe("dosage queries (handoff §6/§8 acceptance)", () => {
	test("'10000 iu' finds the comma dosage product", () => {
		expect(topIds("10000 iu")).toContain(1);
	});

	test("'d3 10000' does not collapse to OR garbage — keeps d3 set", () => {
		const ids = topIds("d3 10000");
		expect(ids).toContain(1);
	});

	test("'naturebell d 10000' ranks target in top 3", () => {
		expect(topIds("naturebell d 10000").slice(0, 3)).toContain(1);
	});
});

describe("min relevance floor / honest empty", () => {
	test("'creatine' returns honest empty, not Height Growth", () => {
		expect(topIds("creatine")).not.toContain(6);
	});
});
