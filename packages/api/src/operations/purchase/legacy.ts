import type { PurchaseError } from "@vit/shared";
import { match } from "dismatch";
import type { LegacyTrpcError } from "~/result/legacy-trpc";

export const purchaseErrorToLegacyTrpc = (error: PurchaseError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		PurchaseNotFound: () => ({
			code: "NOT_FOUND",
			message: "Purchase not found",
		}),
		PurchaseItemNotFound: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Purchase item not found",
		}),
		CannotRemoveReceivedItem: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cannot remove purchase item that has receipts",
		}),
		OrderedQuantityBelowReceived: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cannot reduce ordered quantity below received quantity",
		}),
		CancelledPurchaseCannotReceive: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cancelled purchase cannot receive items",
		}),
		ReceiptItemsMismatch: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Receipt items do not match purchase items",
		}),
		ReceiptExceedsRemaining: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cannot receive more than remaining quantity",
		}),
		CannotDeletePurchaseWithReceipts: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cannot delete purchase with receipts",
		}),
		InvalidPurchaseTransition: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Invalid purchase transition",
		}),
	});
