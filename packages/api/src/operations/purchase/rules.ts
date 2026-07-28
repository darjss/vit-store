import { Result } from "better-result";
import {
	cancelledPurchaseCannotReceive,
	cannotDeletePurchaseWithReceipts,
	cannotRemoveReceivedItem,
	orderedQuantityBelowReceived,
	purchaseItemNotFound,
	purchaseNotFound,
	receiptExceedsRemaining,
	receiptItemsMismatch,
} from "~/errors/factories/admin";

export type ExistingPurchaseItem = {
	id: number;
	quantityOrdered: number;
	receiptItems: Array<{ quantityReceived: number }>;
};

export type IncomingPurchaseItem = {
	id?: number;
	quantityOrdered: number;
};

const receivedQuantity = (item: ExistingPurchaseItem) =>
	item.receiptItems.reduce(
		(total, receiptItem) => total + receiptItem.quantityReceived,
		0,
	);

export const validatePurchaseItemUpdate = (
	existingItems: ExistingPurchaseItem[],
	incomingItems: IncomingPurchaseItem[],
) => {
	const existingById = new Map(existingItems.map((item) => [item.id, item]));
	const incomingIds = new Set(
		incomingItems.flatMap((item) =>
			typeof item.id === "number" ? [item.id] : [],
		),
	);

	for (const existingItem of existingItems) {
		if (
			!incomingIds.has(existingItem.id) &&
			receivedQuantity(existingItem) > 0
		) {
			return Result.err(cannotRemoveReceivedItem());
		}
	}

	for (const incomingItem of incomingItems) {
		if (incomingItem.id === undefined) continue;
		const existingItem = existingById.get(incomingItem.id);
		if (!existingItem) return Result.err(purchaseItemNotFound());
		const received = receivedQuantity(existingItem);
		if (incomingItem.quantityOrdered < received) {
			return Result.err(orderedQuantityBelowReceived(received));
		}
	}

	return Result.ok(undefined);
};

export type ReceiptPurchase = {
	cancelledAt: Date | null;
};

export type ReceiptPurchaseItem = ExistingPurchaseItem & {
	productId: number;
};

export type IncomingReceiptItem = {
	purchaseItemId: number;
	quantityReceived: number;
};

export const validatePurchaseReceipt = (
	purchase: ReceiptPurchase | undefined,
	purchaseItems: ReceiptPurchaseItem[],
	incomingItems: IncomingReceiptItem[],
) => {
	if (!purchase) return Result.err(purchaseNotFound());
	if (purchase.cancelledAt) {
		return Result.err(cancelledPurchaseCannotReceive());
	}
	const incomingItemIds = new Set(
		incomingItems.map((item) => item.purchaseItemId),
	);
	if (
		purchaseItems.length !== incomingItems.length ||
		incomingItemIds.size !== incomingItems.length
	) {
		return Result.err(receiptItemsMismatch());
	}

	const itemsById = new Map(purchaseItems.map((item) => [item.id, item]));
	for (const receiptItem of incomingItems) {
		const purchaseItem = itemsById.get(receiptItem.purchaseItemId);
		if (!purchaseItem) return Result.err(purchaseItemNotFound());
		const remaining =
			purchaseItem.quantityOrdered - receivedQuantity(purchaseItem);
		if (receiptItem.quantityReceived > remaining) {
			return Result.err(receiptExceedsRemaining(Math.max(remaining, 0)));
		}
	}

	return Result.ok(undefined);
};

export const validatePurchaseDeletion = (
	purchase: { receipts: Array<{ id: number }> } | undefined,
) => {
	if (!purchase) return Result.err(purchaseNotFound());
	if (purchase.receipts.length > 0) {
		return Result.err(cannotDeletePurchaseWithReceipts());
	}
	return Result.ok(undefined);
};
