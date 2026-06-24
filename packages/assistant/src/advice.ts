import { defineTool } from "@flue/runtime";
import * as v from "valibot";

// Channel-neutral product-advice domain (#22, ADR 0002/0007). The customer
// assistant answers real Messenger advice flows — "энэ юунд сайн бэ" (what is
// this good for), "али нь сайн бэ" (which is better), ingredients, forms, and
// usage directions — and it must answer FROM real catalog/label data, never
// invented medical facts. This tool is the read side of that: it resolves the
// label-data projection for a set of product ids and hands the facts back to
// the model, which then composes the reply (and sends it via
// post_messenger_message). The transport (catalog API client) is injected so
// this stays reusable across channels and unit-testable without a network — the
// same shape as the #19 search and #20 photo tools.

// Runtime contract for the label-data projection the advice tool operates on.
// Mirrors the api `getProductsByIdsForAdvice` procedure. The hand-rolled tRPC
// transport (apps/agent/src/lib/catalog.ts) deserializes an untyped wire
// payload, so it MUST v.parse this at the boundary: api-side shape drift then
// fails loudly here instead of silently feeding the model `undefined` fields.
export const assistantAdviceProductSchema = v.object({
	id: v.number(),
	name: v.string(),
	brand: v.string(),
	category: v.string(),
	// Free-text label/marketing description. May be empty — the model must then
	// stay general and not fabricate a use.
	description: v.string(),
	// Label ingredient list. May be empty when the catalog has none recorded.
	ingredients: v.array(v.string()),
	// Pack size / count, e.g. "120 capsules".
	amount: v.string(),
	// Strength per unit, e.g. "200mg", "5000 IU".
	potency: v.string(),
	// Label-recommended units per day; 0 when unknown.
	dailyIntake: v.number(),
	price: v.number(),
});

export type AssistantAdviceProduct = v.InferOutput<
	typeof assistantAdviceProductSchema
>;

export const PRODUCT_ADVICE_TOOL_NAME = "get_product_advice";

// Soft reply when the catalog transport itself fails (timeout, network, tRPC
// error). Keeps the customer in the conversation instead of throwing the turn
// out with nothing user-facing.
export const ADVICE_ERROR_MESSAGE =
	"Уучлаарай, яг одоо барааны дэлгэрэнгүй мэдээлэл авахад түр алдаа гарлаа. Хэсэг хүлээгээд дахин оролдоно уу.";

export interface ProductAdviceToolDeps {
	// Resolves the label-data projection for the given ids using the existing
	// storefront catalog (do not duplicate catalog logic). Returns only the ids
	// that still resolve, in request order. The optional signal carries the tool
	// turn's cancellation/timeout deadline through to the underlying fetch.
	getAdviceProducts: (
		ids: number[],
		signal?: AbortSignal,
	) => Promise<AssistantAdviceProduct[]>;
	// Sends a plain text reply (used only for the transport-error path).
	sendText: (text: string) => Promise<unknown>;
}

// Builds the conversation-bound product-advice tool. The model first finds the
// product(s) with search_products (which returns ids), then calls this with
// those ids to get the label facts, then explains/compares in its own words via
// post_messenger_message. Returning the raw projection (rather than a
// pre-written sentence) keeps the medical-safety judgement in the model under
// the system instructions, and lets it answer ingredients/usage/comparison from
// the same single fetch. Empty description/ingredients are surfaced as-is so the
// model can stay general instead of inventing a use.
export const buildProductAdviceTool = (deps: ProductAdviceToolDeps) =>
	defineTool({
		name: PRODUCT_ADVICE_TOOL_NAME,
		description:
			"Fetch real catalog label data (description, ingredients, pack size, potency, recommended daily intake, brand, category, price) for one or more products so you can answer advice and comparison questions. Call this whenever the customer asks what a product is commonly used for ('энэ юунд сайн бэ'), which of several is better ('али нь сайн бэ'), what is in it ('найрлага'), what form/dose it is, or how to take it. First find the product(s) with search_products to get their ids, then pass those ids here (pass several ids to compare). Answer ONLY from the returned data; if a field is empty, say you don't have that detail rather than inventing it. Never claim a product cures, heals, treats, or diagnoses anything, and never guarantee an outcome.",
		input: v.object({
			productIds: v.pipe(
				v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
				v.minLength(1),
				v.maxLength(5),
				v.description(
					"The catalog ids of the product(s) to fetch label data for, taken from a prior search_products result. Pass two or more to compare them.",
				),
			),
		}),
		async run({ input, signal }) {
			let products: AssistantAdviceProduct[];
			try {
				products = await deps.getAdviceProducts(input.productIds, signal);
			} catch {
				await deps.sendText(ADVICE_ERROR_MESSAGE);
				return {
					requestedIds: input.productIds,
					matchCount: 0,
					missingIds: input.productIds,
					sent: "advice_error_text",
					products: [],
				};
			}

			return {
				requestedIds: input.productIds,
				matchCount: products.length,
				// Ids requested that no longer resolve (out of stock / removed); the
				// model should not claim to know about these.
				missingIds: input.productIds.filter(
					(id) => !products.some((product) => product.id === id),
				),
				sent: "advice_facts",
				products: products.map((product) => ({
					id: product.id,
					name: product.name,
					brand: product.brand,
					category: product.category,
					description: product.description,
					ingredients: product.ingredients,
					amount: product.amount,
					potency: product.potency,
					dailyIntake: product.dailyIntake,
					price: product.price,
					hasDescription: product.description.trim().length > 0,
					hasIngredients: product.ingredients.length > 0,
				})),
			};
		},
	});
