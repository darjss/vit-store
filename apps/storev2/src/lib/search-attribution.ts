import * as v from "valibot";

export const searchAttributionSchema = v.object({
	clickedAt: v.number(),
	position: v.number(),
	productId: v.number(),
	query: v.string(),
	searchId: v.string(),
});

export type SearchAttribution = v.InferOutput<typeof searchAttributionSchema>;
