import * as v from "valibot";

export const aiExtractionStartSchema = v.strictObject({
	sessionId: v.string(),
	step: v.literal("searching"),
	productUrl: v.string(),
});

export const aiExtractionProgressSchema = v.strictObject({
	sessionId: v.string(),
	step: v.picklist(["extracting", "translating"]),
});

export const extractedProductDataSchema = v.strictObject({
	originalTitle: v.string(),
	originalDescription: v.nullable(v.string()),
	originalFeatures: v.array(v.string()),
	originalIngredients: v.array(v.string()),
	name: v.string(),
	name_mn: v.string(),
	description: v.string(),
	brand: v.nullable(v.string()),
	brandId: v.nullable(v.number()),
	categoryId: v.nullable(v.number()),
	amount: v.string(),
	potency: v.string(),
	dailyIntake: v.number(),
	weightGrams: v.number(),
	seoTitle: v.string(),
	seoDescription: v.string(),
	tags: v.optional(v.array(v.string())),
	ingredients: v.array(v.string()),
	images: v.array(v.strictObject({ url: v.string() })),
	sourceUrl: v.nullable(v.string()),
	amazonPriceUsd: v.nullable(v.number()),
	calculatedPriceMnt: v.nullable(v.number()),
	extractionStatus: v.picklist(["success", "partial", "failed"]),
	errors: v.array(v.string()),
	slug: v.string(),
});

export const aiBatchItemSchema = v.strictObject({
	amazonUrl: v.string(),
	productId: v.nullable(v.number()),
	slug: v.nullable(v.string()),
	status: v.picklist(["created", "duplicate_flag", "failed"]),
	failureTag: v.optional(
		v.picklist([
			"InvalidSource",
			"ExtractionFailed",
			"InvalidModelOutput",
			"ProductResolutionRequired",
			"NoUsableImages",
			"ProviderUnavailable",
		]),
	),
});

export const aiBatchResultSchema = v.strictObject({
	results: v.array(aiBatchItemSchema),
	summary: v.strictObject({
		total: v.number(),
		created: v.number(),
		duplicates: v.number(),
		failed: v.number(),
	}),
});

export const regeneratedProductImagesSchema = v.strictObject({
	images: v.array(v.strictObject({ url: v.string() })),
	sourceUrl: v.string(),
	count: v.number(),
});
