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
	compareAtPrice: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	dailyIntake: 2,
	description: "Magnesium for sleep and stress support",
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
		expect(serialized).toContain('"prefix":true,"value":"d3"');
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

		expect(serialized).toContain('"primaryName":{"$boost":18,"$smart":"magnesium"}');
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

	test("matches the last word as a prefix at any length", () => {
		const short = JSON.stringify(buildProductSearchFilter("magnesium g", "generation"));
		const long = JSON.stringify(buildProductSearchFilter("nutricost creatin", "generation"));

		expect(short).toContain('"prefix":true,"value":"g"');
		expect(short).not.toContain('"$eq":"g"');
		expect(short).not.toContain('"prefix":true,"value":"magnesium"');
		expect(long).toContain('"prefix":true,"value":"creatin"');
		expect(long).toContain('"$smart":"creatin"');
	});

	test("joins a lone letter to its number and splits a glued dose", () => {
		const joined = JSON.stringify(buildProductSearchFilter("q 10", "generation"));
		const split = buildProductSearchFilter("d35000", "generation");

		expect(joined).toContain('"prefix":true,"value":"q10"');
		expect(joined).not.toContain('"$eq":"q"');
		expect(split.$must).toHaveLength(4);
		expect(JSON.stringify(split)).toContain('"prefix":true,"value":"d3"');
		expect(JSON.stringify(split)).toContain('"prefix":true,"value":"5000"');
	});

	test("splits glued vitamin codes in either script", () => {
		const latin = buildProductSearchFilter("d3k2", "generation");
		const cyrillic = JSON.stringify(buildProductSearchFilter("д3к2", "generation"));

		expect(latin.$must).toHaveLength(4);
		expect(cyrillic).toContain('"value":"d3"');
		expect(cyrillic).toContain('"value":"k2"');
	});

	test("also matches the stem and the Latin spelling of a word", () => {
		const suffixed = JSON.stringify(buildProductSearchFilter("k2toi", "generation"));
		const cyrillic = JSON.stringify(buildProductSearchFilter("мүл", "generation"));

		expect(suffixed).toContain('"prefix":true,"value":"k2"');
		expect(suffixed).toContain('"prefix":true,"value":"k2toi"');
		expect(cyrillic).toContain('"prefix":true,"value":"мүл"');
		expect(cyrillic).toContain('"prefix":true,"value":"mul"');
	});

	test("reads Cyrillic vitamin letters next to the vitamin word", () => {
		const serialized = JSON.stringify(buildProductSearchFilter("витамин ц", "generation"));

		expect(serialized).toContain('"$smart":"vitamin"');
		expect(serialized).toContain('"prefix":true,"value":"c"');
		expect(serialized).not.toContain("витамин");
	});

	test("keeps a lone letter literal away from the vitamin word", () => {
		const serialized = JSON.stringify(
			buildProductSearchFilter("myo d chiro inositol", "generation"),
		);

		expect(serialized).toContain('"$eq":"d"');
		expect(serialized).not.toContain('"d3"');
	});

	test("rewrites alias phrases on whole words only", () => {
		const serialized = JSON.stringify(buildProductSearchFilter("blackmores", "generation"));
		const folate = JSON.stringify(buildProductSearchFilter("фолийн хүчил", "generation"));

		expect(serialized).toContain('"$smart":"blackmores"');
		expect(serialized).not.toContain("blackmoress");
		expect(folate).toContain('"$smart":"folate"');
		expect(folate).not.toContain("хүчил");
	});

	test("tolerates two typos in long words outside the direct pass", () => {
		const direct = JSON.stringify(buildProductSearchFilter("isonitol", "generation"));
		const broad = JSON.stringify(
			buildProductSearchFilter("isonitol", "generation", undefined, "broad"),
		);

		expect(direct).not.toContain('"$fuzzy"');
		expect(broad).toContain(
			'"$fuzzy":{"distance":2,"transpositionCostOne":true,"value":"isonitol"}',
		);
	});

	test("lets any word match in the relaxed pass", () => {
		const filter = buildProductSearchFilter(
			"micro ingredients myo inositol veggie capsules",
			"generation",
			undefined,
			"relaxed",
		);

		expect(filter.$must).toHaveLength(3);
		expect(JSON.stringify(filter.$must)).toContain('"$should":[{"$should"');
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

	test("takes spelling aliases from the primary name only", () => {
		const gummies = buildProductSearchDocument(
			sourceProduct({ name: "Nutricost, Elderberry Gummies with Vitamin C & Zinc, 120 Gummies" }),
		);
		const zinc = buildProductSearchDocument(
			sourceProduct({ name: "Nutricost, Zinc Picolinate, 50 mg, 240 Capsules" }),
		);

		expect(gummies.aliases).not.toContain("zink");
		expect(zinc.aliases).toContain("zink");
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
