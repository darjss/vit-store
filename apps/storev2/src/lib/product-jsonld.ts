import { number, object, optional, safeParse, string } from "valibot";

const productJsonLdSchema = object({
	offers: optional(
		object({
			availability: optional(string()),
			price: optional(number()),
		}),
	),
});

export function parseProductJsonLd(scriptContent: string) {
	return safeParse(productJsonLdSchema, JSON.parse(scriptContent));
}
