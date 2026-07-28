import * as v from "valibot";
import { publicErrorSchema } from "./errors";

export const stockTransitionErrorSchema = v.variant("_tag", [
	publicErrorSchema("ProductNotFound", {
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
	publicErrorSchema("ProductInactive", {
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
	publicErrorSchema("InsufficientStock", {
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		current: v.pipe(v.number(), v.integer()),
		delta: v.pipe(v.number(), v.integer()),
	}),
	publicErrorSchema("ConcurrentStockUpdate", {
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
]);

export type StockTransitionError = v.InferOutput<
	typeof stockTransitionErrorSchema
>;
