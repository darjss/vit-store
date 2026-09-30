import { z } from "zod";

export const visionAnalysisSchema = z.object({
	dailyIntake: z.number().nullable().describe("How many to take per day"),
	ingredients: z
		.array(z.string())
		.describe("List of ingredients with amounts, e.g. 'Vitamin D3 - 5000 IU (625%)'"),
	servingSize: z.string().nullable().describe("Serving size, e.g. '1 softgel'"),
	supplementFacts: z.string().nullable().describe("Raw supplement facts text if visible"),
});
export type VisionAnalysisOutput = z.infer<typeof visionAnalysisSchema>;

export const translationSchema = z.object({
	amount: z.string().describe("Count/quantity, e.g. '120 Softgels'"),
	brandId: z
		.number()
		.nullable()
		.describe("The ID of the matching brand from the BRANDS list, or null if no match"),
	categoryId: z
		.number()
		.nullable()
		.describe("The ID of the best matching category from the CATEGORIES list, or null if no match"),
	dailyIntake: z.number().describe("Pills per day"),
	description: z.string().describe("Product description in Mongolian Cyrillic"),
	ingredients: z.array(z.string()).describe("Ingredients in Mongolian Cyrillic"),
	name: z.string().describe("Clean product name without brand"),
	name_mn: z.string().describe("Product name in Mongolian Cyrillic"),
	potency: z.string().describe("Strength/potency, e.g. '5000 IU', '1000mg'"),
	seoDescription: z.string().describe("SEO description with Mongolian + English for search"),
	seoTitle: z.string().describe("SEO title with Mongolian + English for search"),
	weightGrams: z.number().describe("Estimated shipping weight in grams"),
});
export type TranslationOutput = z.infer<typeof translationSchema>;

export const amazonProductSchema = {
	properties: {
		brand: { description: "The brand name of the product", type: "string" },
		description: { description: "Product description text", type: "string" },
		features: {
			description: "Product feature bullet points",
			items: { type: "string" },
			type: "array",
		},
		ingredients: {
			description: "List of ingredients with amounts",
			items: { type: "string" },
			type: "array",
		},
		priceText: {
			description: "Visible product price text like '$16.95'",
			type: "string",
		},
		priceUsd: {
			description: "Current buy-box / price-to-pay in USD",
			type: "number",
		},
		servingSize: {
			description: "Serving size info (e.g., '1 capsule', '2 softgels')",
			type: "string",
		},
		servingsPerContainer: {
			description: "Number of servings per container",
			type: "number",
		},
		title: { description: "The product title/name", type: "string" },
	},
	required: ["title"],
	type: "object",
};
