import * as v from "valibot";
import type { FirecrawlExtractedProduct } from "@vit/shared";

const amazonPriceUsdSchema = v.pipe(v.number(), v.finite(), v.minValue(0.01), v.maxValue(1000));
const nullableAmazonPriceUsdSchema = v.nullable(amazonPriceUsdSchema);
const looseAmazonPriceUsdSchema = v.nullable(v.number());

export const firecrawlAmazonJsonSchema = v.object({
	brand: v.optional(v.nullable(v.string())),
	description: v.optional(v.nullable(v.string())),
	features: v.optional(v.array(v.string())),
	ingredients: v.optional(v.array(v.string())),
	priceUsd: v.optional(looseAmazonPriceUsdSchema),
	servingSize: v.optional(v.nullable(v.string())),
	servingsPerContainer: v.optional(v.nullable(v.number())),
	title: v.optional(v.string()),
});

export type FirecrawlAmazonJson = v.InferOutput<typeof firecrawlAmazonJsonSchema>;

export const firecrawlExtractedProductSchema: v.GenericSchema<FirecrawlExtractedProduct> =
	v.object({
		brand: v.nullable(v.string()),
		description: v.nullable(v.string()),
		features: v.array(v.string()),
		images: v.array(v.string()),
		ingredients: v.array(v.string()),
		priceUsd: nullableAmazonPriceUsdSchema,
		servingSize: v.nullable(v.string()),
		servingsPerContainer: v.nullable(v.number()),
		title: v.string(),
	});

export const amazonScrapeCacheSchema = v.object({
	extracted: firecrawlExtractedProductSchema,
});

export const amazonSearchCacheSchema = v.nullable(v.string());

export function normalizeFirecrawlPriceUsd(value: number | null | undefined): number | null {
	if (value == null || !Number.isFinite(value)) {
		return null;
	}
	const parsed = v.safeParse(amazonPriceUsdSchema, value);
	return parsed.success ? parsed.output : null;
}

export function toFirecrawlExtractedProduct(
	json: FirecrawlAmazonJson,
	images: Array<string>,
	priceUsd: number | null,
): FirecrawlExtractedProduct {
	return {
		brand: json.brand ?? null,
		description: json.description ?? null,
		features: json.features ?? [],
		images,
		ingredients: json.ingredients ?? [],
		priceUsd,
		servingSize: json.servingSize ?? null,
		servingsPerContainer: json.servingsPerContainer ?? null,
		title: json.title ?? "",
	};
}
