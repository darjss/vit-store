import { describe, expect, test } from "bun:test";
import {
	buildProductAliases,
	createSearchQueries,
	expandLatinAliases,
	normalizeSearchText,
} from "./text";
import type { ProductSearchSourceDocument } from "./types";

describe("normalizeSearchText comma-grouped numbers", () => {
	test("merges comma-grouped digits into a single token", () => {
		expect(normalizeSearchText("10,000 IU")).toBe("10000 iu");
		expect(normalizeSearchText("1,000,000")).toBe("1000000");
	});

	test("bare number stays the same token", () => {
		expect(normalizeSearchText("10000 iu")).toBe("10000 iu");
	});

	test("comma between non-digits still splits", () => {
		expect(normalizeSearchText("Naturebell, D3")).toBe("naturebell d3");
	});
});

const naturebell: ProductSearchSourceDocument = {
	id: 1,
	name: "Naturebell, D3 + K2, 10,000 IU D3 & 200 mcg K2, 240 Softgels",
	nameMn: null,
	slug: "naturebell-d3-k2",
	price: 1,
	brand: "Naturebell",
	category: "Vitamins",
	status: "active",
	stock: 3,
	amount: "10,000 IU",
	potency: "10,000 IU",
};

describe("dosage tokens index symmetrically", () => {
	test("product aliases contain the comma-stripped dosage token", () => {
		const aliases = buildProductAliases(naturebell);
		expect(aliases.some((a) => a.split(" ").includes("10000"))).toBe(true);
	});

	test("no-comma query normalizes to the same dosage token", () => {
		expect(createSearchQueries("10000 iu")).toContain("10000 iu");
		expect(createSearchQueries("10,000 iu")).toContain("10000 iu");
	});
});

describe("expandLatinAliases", () => {
	test("keeps original token and adds aliases", () => {
		expect(expandLatinAliases("magnesium")).toContain("магни");
		expect(expandLatinAliases("magnesium")).toContain("magnesium");
	});
});
