import { z } from "zod";

export const imageSelectionSchema = z.object({
	keepIndices: z.array(z.number().int().min(0)).max(8),
	primaryIndex: z.number().int().min(0).nullable(),
});
export type ImageSelectionResult = z.infer<typeof imageSelectionSchema>;

export const visionAnalysisSchema = z.object({
	ingredients: z
		.array(z.string())
		.describe(
			"List of ingredients with amounts, e.g. 'Vitamin D3 - 5000 IU (625%)'",
		),
	servingSize: z.string().nullable().describe("Serving size, e.g. '1 softgel'"),
	dailyIntake: z.number().nullable().describe("How many to take per day"),
	supplementFacts: z
		.string()
		.nullable()
		.describe("Raw supplement facts text if visible"),
});
export type VisionAnalysisOutput = z.infer<typeof visionAnalysisSchema>;

export const translationSchema = z.object({
	name: z.string().describe("Clean product name without brand"),
	name_mn: z.string().describe("Product name in Mongolian Cyrillic"),
	description: z.string().describe("Product description in Mongolian Cyrillic"),
	amount: z.string().describe("Count/quantity, e.g. '120 Softgels'"),
	potency: z.string().describe("Strength/potency, e.g. '5000 IU', '1000mg'"),
	dailyIntake: z.number().describe("Pills per day"),
	weightGrams: z.number().describe("Estimated shipping weight in grams"),
	seoTitle: z.string().describe("SEO title with Mongolian + English for search"),
	seoDescription: z
		.string()
		.describe("SEO description with Mongolian + English for search"),
	ingredients: z.array(z.string()).describe("Ingredients in Mongolian Cyrillic"),
	brandId: z
		.number()
		.nullable()
		.describe(
			"The ID of the matching brand from the BRANDS list, or null if no match",
		),
	categoryId: z
		.number()
		.nullable()
		.describe(
			"The ID of the best matching category from the CATEGORIES list, or null if no match",
		),
});
export type TranslationOutput = z.infer<typeof translationSchema>;

export const amazonProductSchema = {
	type: "object",
	properties: {
		title: { type: "string", description: "The product title/name" },
		brand: { type: "string", description: "The brand name of the product" },
		description: { type: "string", description: "Product description text" },
		features: {
			type: "array",
			items: { type: "string" },
			description: "Product feature bullet points",
		},
		servingSize: {
			type: "string",
			description: "Serving size info (e.g., '1 capsule', '2 softgels')",
		},
		servingsPerContainer: {
			type: "number",
			description: "Number of servings per container",
		},
		priceUsd: {
			type: "number",
			description: "Current buy-box / price-to-pay in USD",
		},
		priceText: {
			type: "string",
			description: "Visible product price text like '$16.95'",
		},
		ingredients: {
			type: "array",
			items: { type: "string" },
			description: "List of ingredients with amounts",
		},
	},
	required: ["title"],
};
