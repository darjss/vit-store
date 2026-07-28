import { purchaseStatus } from "../../constants";
import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const purchaseErrorSchema = v.variant("_tag", [
	publicErrorSchema("PurchaseNotFound", {
		message: v.string(),
	}),
	publicErrorSchema("PurchaseItemNotFound", {
		message: v.string(),
	}),
	publicErrorSchema("CannotRemoveReceivedItem", {
		message: v.string(),
	}),
	publicErrorSchema("OrderedQuantityBelowReceived", {
		received: v.pipe(v.number(), v.integer(), v.minValue(1)),
		message: v.string(),
	}),
	publicErrorSchema("CancelledPurchaseCannotReceive", {
		message: v.string(),
	}),
	publicErrorSchema("ReceiptItemsMismatch", {
		message: v.string(),
	}),
	publicErrorSchema("ReceiptExceedsRemaining", {
		remaining: v.pipe(v.number(), v.integer(), v.minValue(0)),
		message: v.string(),
	}),
	publicErrorSchema("CannotDeletePurchaseWithReceipts", {
		message: v.string(),
	}),
	publicErrorSchema("InvalidPurchaseTransition", {
		from: v.picklist(purchaseStatus),
		to: v.picklist(purchaseStatus),
		message: v.string(),
	}),
]);

export type PurchaseError = v.InferOutput<typeof purchaseErrorSchema>;
