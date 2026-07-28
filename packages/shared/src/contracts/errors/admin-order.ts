import { orderStatus } from "../../constants";
import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const adminOrderFailureTagSchema = v.picklist([
	"OrderNotFound",
	"InvalidOrderTransition",
	"StockConflict",
	"DeliverySubmissionFailed",
]);

export const adminBatchFailureSchema = v.strictObject({
	targetId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	targetLabel: v.string(),
	errorTag: adminOrderFailureTagSchema,
});

export const adminOrderErrorSchema = v.variant("_tag", [
	publicErrorSchema("OrderNotFound", {
		message: v.string(),
	}),
	publicErrorSchema("InvalidOrderTransition", {
		from: v.picklist(orderStatus),
		to: v.picklist(orderStatus),
		message: v.string(),
	}),
	publicErrorSchema("StockConflict", {
		items: v.array(
			v.strictObject({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				requested: v.pipe(v.number(), v.integer()),
				available: v.optional(v.pipe(v.number(), v.integer())),
			}),
		),
		message: v.string(),
	}),
	publicErrorSchema("DeliverySubmissionFailed", {
		retryable: v.boolean(),
		message: v.string(),
	}),
	publicErrorSchema("BatchPartiallyFailed", {
		total: v.pipe(v.number(), v.integer(), v.minValue(1)),
		succeeded: v.pipe(v.number(), v.integer(), v.minValue(0)),
		failures: v.pipe(v.array(adminBatchFailureSchema), v.minLength(1)),
		message: v.string(),
	}),
]);

export type AdminOrderError = v.InferOutput<typeof adminOrderErrorSchema>;
export type AdminBatchFailure = v.InferOutput<typeof adminBatchFailureSchema>;
