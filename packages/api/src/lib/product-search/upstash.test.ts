import { describe, expect, test } from "bun:test";
import { buildProductSearchDocument } from "~/lib/product-search/document";
import type { ProductSearchSourceDocument } from "~/lib/product-search/types";
import { buildProductSearchFilter } from "~/lib/product-search/upstash";

const sourceProduct = (
	overrides: Partial<ProductSearchSourceDocument> = {},
): ProductSearchSourceDocument => ({
	id: 1,
	name: "Naturebell, Magnesium Glycinate, 1,000 mg, 240 Capsules",
	nameMn: null,
	description: "Magnesium for sleep and stress support",
	slug: "naturebell-magnesium-glycinate",
	price: 120_000,
	createdAt: "2026-01-01T00:00:00.000Z",
	discount: 0,
	brand: "Naturebell",
	category: "Magnesium",
	status: "active",
	stock: 4,
	amount: "1,000 mg",
	potency: "500 mg",
	dailyIntake: 2,
	brandId: 10,
	categoryId: 20,
	isFeatured: false,
	ingredients: ["Magnesium glycinate"],
	tags: ["sleep", "stress"],
	image: "https://example.com/magnesium.jpg",
	...overrides,
});

describe("product search query", () => {
	test("requires both meaningful terms for vitamin-letter searches", () => {
		const filter = buildProductSearchFilter("vitamin d", "generation");
		const serialized = JSON.stringify(filter);

		expect(filter.$must).toHaveLength(4);
		expect(serialized).toContain('"$smart":"vitamin"');
		expect(serialized).toContain('"value":"d3","prefix":true');
		expect(serialized).not.toContain('"$smart":"d3"');
		expect(serialized).not.toContain('"$smart":"d"');
	});

	test("keeps a single vitamin letter exact inside a multi-word query", () => {
		const serialized = JSON.stringify(
			buildProductSearchFilter("b complex", "generation"),
		);

		expect(serialized).toContain('"$smart":"vitamin"');
		expect(serialized).toContain('"$eq":"b"');
		expect(serialized).not.toContain('"$smart":"b"');
		expect(serialized).toContain('"$smart":"complex"');
	});

	test("canonicalizes split brand names before matching", () => {
		const serialized = JSON.stringify(
			buildProductSearchFilter("nature bell", "generation"),
		);

		expect(serialized).toContain('"$smart":"naturebell"');
		expect(serialized).not.toContain('"$smart":"bell"');
	});

	test("ranks direct symptom ingredients ahead of broad intent matches", () => {
		const serialized = JSON.stringify(
			buildProductSearchFilter("нойр", "generation"),
		);

		expect(serialized.indexOf('"$smart":"melatonin"')).toBeLessThan(
			serialized.indexOf('"$smart":"magnesium"'),
		);
		expect(serialized).toContain('"$smart":"5 htp"');
	});
});

describe("product search document", () => {
	test("indexes aliases, dosage, and symptom intent", () => {
		const document = buildProductSearchDocument(sourceProduct());

		expect(document.aliases).toContain("nature bell");
		expect(document.dosage).toBe("1000 mg 500 mg");
		expect(document.intentTerms).toContain("нойр");
		expect(document.intentTerms).toContain("stress");
		expect(document.ingredientPreviewJson).toBe(
			JSON.stringify(["Magnesium glycinate"]),
		);
	});
});
