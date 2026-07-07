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
	{
		id: 7,
		name: "Doctor's Best, Collagen Types 1 and 3, 200 Tablets",
		nameMn: "коллаген",
		slug: "doctors-best-collagen",
		price: 55,
		brand: "Doctor's Best",
		category: "Supplements",
		status: "active",
		stock: 12,
	},
	{
		id: 8,
		name: "Now Foods, Melatonin, 3 mg, 180 Capsules",
		nameMn: "мелатонин",
		slug: "now-melatonin-3mg",
		price: 30,
		brand: "Now Foods",
		category: "Sleep",
		status: "active",
		stock: 25,
	},
	{
		id: 9,
		name: "Doctor's Best, Glucosamine Chondroitin MSM, 120 Capsules",
		nameMn: "глюкозамин",
		slug: "doctors-best-glucosamine",
		price: 70,
		brand: "Doctor's Best",
		category: "Joints",
		status: "active",
		stock: 8,
	},
	{
		id: 10,
		name: "Jarrow Formulas, Methyl B-12, 1000 mcg, 100 Lozenges",
		nameMn: null,
		slug: "jarrow-methyl-b12",
		price: 45,
		brand: "Jarrow Formulas",
		category: "Vitamins",
		status: "active",
		stock: 5,
	},
	{
		id: 11,
		name: "MegaStock Jarrow Formula Copycat Blend",
		nameMn: null,
		slug: "megastock-copycat",
		price: 20,
		brand: "MegaStock",
		category: "Supplements",
		status: "active",
		stock: 999,
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

	test("exact dosage outranks higher-stock other dosages", () => {
		expect(topIds("d3 10000 iu")[0]).toBe(1);
	});
});

describe("short vitamin-letter tokens (handoff §6.4)", () => {
	test("'d 10000' expands to d3 and finds the target", () => {
		expect(topIds("d 10000")).toContain(1);
	});

	test("'c 1000' finds the vitamin C product", () => {
		expect(topIds("c 1000")).toContain(5);
	});
});

describe("symptom -> ingredient expansion (handoff Phase B)", () => {
	test("'нойргүйдэл' (insomnia) surfaces melatonin", () => {
		expect(topIds("нойргүйдэл")).toContain(8);
	});

	test("'үе мөч' (joints) surfaces glucosamine", () => {
		expect(topIds("үе мөч")).toContain(9);
	});

	test("'fatigue' does not error and stays tag-independent", () => {
		expect(Array.isArray(search("fatigue"))).toBe(true);
	});
});

describe("brand canonicalization (handoff §6.5)", () => {
	test("'nature bell' ranks Naturebell #1 above Nature's Plus", () => {
		expect(topIds("nature bell")[0]).toBe(1);
	});
});

describe("min relevance floor / honest empty (handoff Phase A)", () => {
	test("'creatine' returns honest empty, not Height Growth", () => {
		expect(topIds("creatine")).not.toContain(6);
	});

	test("nonsense query returns nothing rather than a stock-ranked product", () => {
		expect(topIds("zzzxqwlk")).toHaveLength(0);
	});

	test("a close typo still corrects (fuzzy survives the floor)", () => {
		expect(topIds("collagen")).toContain(7);
		expect(topIds("colagen")).toContain(7);
	});

	test("GOOD exact terms still return", () => {
		expect(topIds("vitamin d3")).toContain(1);
		expect(topIds("коллаген")).toContain(7);
	});
});

describe("unmatched known token stays required (FIX 1)", () => {
	test("'creatine vitamin d3' is honest — no d3-only leak", () => {
		expect(topIds("creatine vitamin d3")).not.toContain(1);
		expect(topIds("creatine vitamin d3")).not.toContain(2);
		expect(topIds("creatine vitamin d3")).not.toContain(3);
	});

	test("'creatine vitamin d3' returns empty (no creatine in catalog)", () => {
		expect(topIds("creatine vitamin d3")).toHaveLength(0);
	});

	test("noise token is still dropped so the real term resolves", () => {
		expect(topIds("d 10000")).toContain(1);
		expect(topIds("c 1000")).toContain(5);
	});
});

describe("multi-word canonical brand boost (FIX 3)", () => {
	test("'jarrow formula' boosts the multi-word Jarrow Formulas brand", () => {
		expect(topIds("jarrow formula")).toContain(10);
		expect(topIds("jarrow formula")[0]).toBe(10);
	});
});
