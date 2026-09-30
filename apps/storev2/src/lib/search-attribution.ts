import { number, object, string, type InferOutput } from "valibot";

export const searchAttributionSchema = object({
	clickedAt: number(),
	position: number(),
	productId: number(),
	query: string(),
	searchId: string(),
});

export type SearchAttribution = InferOutput<typeof searchAttributionSchema>;
