import {
	adminCreatedSuccessSchema,
	adminMutationSuccessSchema,
	purchaseErrorSchema,
	type addPurchaseType,
	type editPurchaseType,
	type receivePurchaseType,
} from "@vit/shared";
import { Result } from "better-result";
import { db } from "~/db/client";
import type { Context } from "~/lib/context";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { scheduleRestockDispatches } from "~/lib/restock";
import { purchaseQueries } from "~/queries/purchases";
export { purchaseErrorToLegacyTrpc } from "./legacy";

export const purchaseCreatedResultSchemas = {
	value: adminCreatedSuccessSchema,
	error: purchaseErrorSchema,
};

export const purchaseMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: purchaseErrorSchema,
};

export const createPurchase = async (input: addPurchaseType) => {
	const created = await db().transaction((tx) =>
		purchaseQueries.admin.createPurchase(tx, input),
	);
	return Result.ok({ id: created.id, message: "Purchase added successfully" });
};

export const updatePurchase = async (id: number, input: editPurchaseType) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.updatePurchase(tx, id, input),
	);
	return result.status === "error"
		? Result.err(result.error)
		: Result.ok({ message: "Purchase updated successfully" });
};

export const receivePurchase = async (
	ctx: Context,
	input: receivePurchaseType,
) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.receivePurchase(tx, input),
	);
	if (result.status === "error") return result;

	const { affectedProductIds, restockCandidates } = result.value;
	if (affectedProductIds.length > 0) {
		await purgeCatalogCache(ctx, affectedProductIds);
		scheduleProductSearchRebuild(ctx, "product_stock_updated");
	}
	scheduleRestockDispatches(ctx, restockCandidates);
	return Result.ok({ message: "Purchase received successfully" });
};

export const deletePurchase = async (id: number) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.deletePurchase(tx, id),
	);
	return result.status === "error"
		? Result.err(result.error)
		: Result.ok({ message: "Purchase deleted successfully" });
};

export const cancelPurchase = async (id: number) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.cancelPurchase(tx, id),
	);
	return result.status === "error"
		? Result.err(result.error)
		: Result.ok({ message: "Purchase cancelled successfully" });
};

export const markPurchaseShipped = async (id: number, shippedAt: Date) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.markPurchaseShipped(tx, id, shippedAt),
	);
	return result.status === "error"
		? Result.err(result.error)
		: Result.ok({ message: "Purchase marked as shipped" });
};

export const markPurchaseForwarderReceived = async (
	id: number,
	forwarderReceivedAt: Date,
) => {
	const result = await db().transaction((tx) =>
		purchaseQueries.admin.markPurchaseForwarderReceived(
			tx,
			id,
			forwarderReceivedAt,
		),
	);
	return result.status === "error"
		? Result.err(result.error)
		: Result.ok({ message: "Purchase marked as received by forwarder" });
};
