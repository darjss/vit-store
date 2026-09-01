import * as v from "valibot";
import type { FirecrawlExtractedProduct } from "@vit/shared";

const amazonPriceUsdSchema = v.pipe(v.number(), v.finite(), v.minValue(0.01), v.maxValue(1000));

export const firecrawlAmazonJsonSchema = v.object({
	brand: v.optional(v.nullable(v.string())),
	description: v.optional(v.nullable(v.string())),
	features: v.optional(v.array(v.string())),
	ingredients: v.optional(v.array(v.string())),
	priceUsd: v.optional(v.nullable(amazonPriceUsdSchema)),
	servingSize: v.optional(v.nullable(v.string())),
	servingsPerContainer: v.optional(v.nullable(v.number())),
	title: v.optional(v.string()),
});

export type FirecrawlAmazonJson = v.InferOutput<typeof firecrawlAmazonJsonSchema>;

export const amazonScrapeCacheSchema = v.object({
	extracted: v.custom<FirecrawlExtractedProduct>(
		(input): input is FirecrawlExtractedProduct =>
			input !== null &&
			Object.prototype.toString.call(input) === "[object Object]" &&
			"title" in input,
	),
});

export const amazonSearchCacheSchema = v.nullable(v.string());

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
