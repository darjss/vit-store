import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import type { Env } from "./env";
import { storeClient, withTimeout } from "./store";

// Search hits get one batch advice fetch in the same tool call so the model
// sees the fields it needs (label summary, amount, dailyIntake) without a
// second tool round-trip.
export const createTools = (env: Env) => ({
	reply: tool({
		description: "Your answer to the customer. Call exactly once, last. Never write totals.",
		execute: async (payload) => payload,
		inputSchema: valibotSchema(
			v.object({
				action: v.optional(v.picklist(["show_cart", "confirm_order"])),
				productIds: v.optional(v.pipe(v.array(v.number()), v.maxLength(10))),
				text: v.pipe(v.string(), v.maxLength(300)),
			}),
		),
	}),
	search_products: tool({
		description:
			"Search the Amerik Vitamin catalog. Query with 1-3 English words. On no hits, retry once with simpler wording.",
		execute: async ({ query }) => {
			const client = storeClient(env);
			const hits = await client.product.searchProductsForAssistant.query(
				{ limit: 6, query },
				{ signal: withTimeout() },
			);
			if (hits.length === 0) {
				return { products: [] };
			}
			const ids = hits.map((h) => h.id);
			const details = await client.product.getProductsByIdsForAdvice.query(
				{ ids },
				{ signal: withTimeout() },
			);
			const byId = new Map(details.map((d) => [d.id, d]));
			return {
				products: hits.map((hit) => {
					const detail = byId.get(hit.id);
					return {
						amount: detail?.amount ?? "",
						brand: hit.brand,
						dailyIntake: detail?.dailyIntake ?? 0,
						expiry: detail?.expirationDate ?? "",
						id: hit.id,
						name: hit.name,
						price: hit.price,
						stock: hit.stockStatus,
						summary: (detail?.description ?? "").slice(0, 160),
					};
				}),
			};
		},
		inputSchema: valibotSchema(
			v.object({ query: v.pipe(v.string(), v.minLength(1), v.maxLength(60)) }),
		),
	}),
});

export type Tools = ReturnType<typeof createTools>;

export const replyOutputSchema = v.object({
	action: v.optional(v.picklist(["show_cart", "confirm_order"])),
	productIds: v.optional(v.array(v.number())),
	text: v.string(),
});
export type ReplyPayload = v.InferOutput<typeof replyOutputSchema>;
