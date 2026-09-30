import { describe, expect, test } from "bun:test";
import {
	buildProductSearchDocument,
	buildProductSearchRankings,
} from "~/lib/product-search/document";
import type { ProductSearchSourceDocument } from "~/lib/product-search/types";
import { buildProductSearchFilter } from "~/lib/product-search/upstash";

const sourceProduct = (
	overrides: Partial<ProductSearchSourceDocument> = {},
): ProductSearchSourceDocument => ({
	amount: "1,000 mg",
	brand: "Naturebell",
	brandId: 10,
	category: "Magnesium",
	categoryId: 20,
	createdAt: "2026-01-01T00:00:00.000Z",
	dailyIntake: 2,
	description: "Magnesium for sleep and stress support",
	discount: 0,
	id: 1,
	image: "https://example.com/magnesium.jpg",
	ingredients: ["Magnesium glycinate"],
	isFeatured: false,
	name: "Naturebell, Magnesium Glycinate, 1,000 mg, 240 Capsules",
	nameMn: null,
	potency: "500 mg",
	price: 120_000,
	slug: "naturebell-magnesium-glycinate",
	status: "active",
	stock: 4,
	tags: ["sleep", "stress"],
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
		const serialized = JSON.stringify(buildProductSearchFilter("b complex", "generation"));

		expect(serialized).not.toContain('"$smart":"vitamin"');
		expect(serialized).toContain('"$eq":"b"');
		expect(serialized).not.toContain('"$smart":"b"');
		expect(serialized).toContain('"$smart":"complex"');
	});

	test("canonicalizes split brand names before matching", () => {
		const serialized = JSON.stringify(buildProductSearchFilter("nature bell", "generation"));

		expect(serialized).toContain('"$smart":"naturebell"');
		expect(serialized).not.toContain('"$smart":"bell"');
	});

	test("ranks direct symptom ingredients ahead of broad intent matches", () => {
		const serialized = JSON.stringify(buildProductSearchFilter("нойр", "generation"));

		expect(serialized.indexOf('"$smart":"melatonin"')).toBeLessThan(
			serialized.indexOf('"$smart":"magnesium"'),
		);
		expect(serialized).toContain('"$smart":"5 htp"');
	});

	test("uses primary product fields for normal ingredient searches", () => {
		const serialized = JSON.stringify(buildProductSearchFilter("magnesium", "generation"));

		expect(serialized).toContain('"primaryName":{"$smart":"magnesium","$boost":18}');
		expect(serialized).not.toContain('"ingredients"');
		expect(serialized).not.toContain('"intentTerms"');
	});

	test("adds descriptive fields only to the broad fallback", () => {
		const serialized = JSON.stringify(
			buildProductSearchFilter("magnesium", "generation", undefined, "broad"),
		);

		expect(serialized).toContain('"ingredients"');
		expect(serialized).toContain('"description"');
	});
});

describe("product search document", () => {
	test("indexes aliases, dosage, and symptom intent", () => {
		const document = buildProductSearchDocument(sourceProduct());

		expect(document.aliases).toContain("nature bell");
		expect(document.aliases).not.toContain("naturebell magnesium glycinate 1000 mg 240 capsules");
		expect(document.dosage).toBe("1000 mg 500 mg");
		expect(document.intentTerms).toContain("нойр");
		expect(document.intentTerms).toContain("stress");
		expect(document.ingredientPreviewJson).toBe(JSON.stringify(["Magnesium glycinate"]));
	});

	test("keeps secondary ingredients out of the primary product name", () => {
		const document = buildProductSearchDocument(
			sourceProduct({
				name: "Naturebell, CoQ10 with Omega-3, 240 Capsules",
			}),
		);

		expect(document.primaryName).toBe("coq10");
	});

	test("combines observed demand with bounded stock bands", () => {
		const products = [sourceProduct({ id: 1, stock: 28 }), sourceProduct({ id: 2, stock: 0 })];
		const rankings = buildProductSearchRankings(products, [
			{
				addToCarts: 20,
				productId: 1,
				searchClickSessions: 5,
				uniqueViewers: 32,
			},
			{
				addToCarts: 2,
				productId: 2,
				searchClickSessions: 1,
				uniqueViewers: 4,
			},
		]);

		expect(rankings.get(1)?.rankingScore).toBe(100);
		expect(rankings.get(2)?.rankingScore).toBeLessThan(20);
	});
});
