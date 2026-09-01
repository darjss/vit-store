import * as v from "valibot";

const productJsonLdSchema = v.object({
	offers: v.optional(
		v.object({
			availability: v.optional(v.string()),
			price: v.optional(v.number()),
		}),
	),
});

export function parseProductJsonLd(scriptContent: string) {
	return v.safeParse(productJsonLdSchema, JSON.parse(scriptContent));
}
