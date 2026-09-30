import { TRPCError } from "@trpc/server";
import { purchaseQueries } from "@vit/api/queries";
import { addPurchaseSchema, listPurchasesSchema, receivePurchaseSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { db } from "~/db/client";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import { scheduleProductSearchRebuild } from "~/lib/product-search/client";
import { scheduleRestockDispatches } from "~/lib/restock";
import { getAverageCostOfProduct } from "~/queries/payments";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
export function buildPurchaseRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addPurchase: proc.input(addPurchaseSchema).mutation(async ({ ctx, input }) => {
			try {
				return await db().transaction(async (tx) => {
					const result = await purchaseQueries.admin.createPurchase(tx, input);
					return {
						id: result.id,
						message: "Purchase added successfully",
					};
				});
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "addPurchase",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : "Adding purchase failed",
				});
			}
		}),
		cancelPurchase: proc
			.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
			.mutation(async ({ ctx, input }) => {
				try {
					await db().transaction(async (tx) => {
						await purchaseQueries.admin.cancelPurchase(tx, input.id);
					});
					return { message: "Purchase cancelled successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "cancelPurchase",
					});
					throw new TRPCError({
						cause: error,
						code:
							error instanceof Error && error.message === "Purchase not found"
								? "NOT_FOUND"
								: "INTERNAL_SERVER_ERROR",
						message: error instanceof Error ? error.message : "Cancelling purchase failed",
					});
				}
			}),
		deletePurchase: proc
			.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
			.mutation(async ({ ctx, input }) => {
				try {
					await db().transaction(async (tx) => {
						await purchaseQueries.admin.deletePurchase(tx, input.id);
					});
					return { message: "Purchase deleted successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "deletePurchase",
					});
					throw new TRPCError({
						cause: error,
						code:
							error instanceof Error && error.message === "Purchase not found"
								? "NOT_FOUND"
								: "INTERNAL_SERVER_ERROR",
						message: error instanceof Error ? error.message : "Deleting purchase failed",
					});
				}
			}),
		getAllPurchases: proc.query(async ({ ctx }) => {
			try {
				return await purchaseQueries.admin.getAllPurchases();
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getAllPurchases",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
				});
			}
		}),
		getAverageCostOfProduct: proc
			.input(
				v.object({
					createdAt: v.date(),
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await getAverageCostOfProduct(db(), input.productId, input.createdAt);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getAverageCostOfProduct",
					});
					return 0;
				}
			}),
		getPaginatedPurchases: proc.input(listPurchasesSchema).query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.getPaginatedPurchases(input);
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getPaginatedPurchases",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
				});
			}
		}),
		getPurchaseById: proc
			.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
			.query(async ({ ctx, input }) => {
				try {
					return await purchaseQueries.admin.getPurchaseById(input.id);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getPurchaseById",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Fetching purchase failed",
					});
				}
			}),
		markPurchaseForwarderReceived: proc
			.input(
				v.object({
					forwarderReceivedAt: v.date(),
					id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					await db().transaction(async (tx) => {
						await purchaseQueries.admin.markPurchaseForwarderReceived(
							tx,
							input.id,
							input.forwarderReceivedAt,
						);
					});
					return { message: "Purchase marked as received by forwarder" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "markPurchaseForwarderReceived",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Updating forwarder receipt failed",
					});
				}
			}),
		markPurchaseShipped: proc
			.input(
				v.object({
					id: v.pipe(v.number(), v.integer(), v.minValue(1)),
					shippedAt: v.date(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					await db().transaction(async (tx) => {
						await purchaseQueries.admin.markPurchaseShipped(tx, input.id, input.shippedAt);
					});
					return { message: "Purchase marked as shipped" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "markPurchaseShipped",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Updating shipment status failed",
					});
				}
			}),
		receivePurchase: proc.input(receivePurchaseSchema).mutation(async ({ ctx, input }) => {
			try {
				const { affectedProductIds, restockCandidates } = await db().transaction(async (tx) => {
					return await purchaseQueries.admin.receivePurchase(tx, input);
				});
				if (affectedProductIds.length > 0) {
					await purgeCatalogCache(ctx, affectedProductIds);
					scheduleProductSearchRebuild(ctx, "product_stock_updated");
				}
				scheduleRestockDispatches(ctx, restockCandidates);
				return { message: "Purchase received successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "receivePurchase",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : "Receiving purchase failed",
				});
			}
		}),
		searchPurchases: proc.input(v.object({ query: v.string() })).query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.searchPurchases(input.query);
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "searchPurchases",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Searching purchases failed",
				});
			}
		}),
		updatePurchase: proc
			.input(
				v.object({
					data: addPurchaseSchema,
					id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					await db().transaction(async (tx) => {
						await purchaseQueries.admin.updatePurchase(tx, input.id, input.data);
					});
					return { message: "Purchase updated successfully" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "updatePurchase",
					});
					throw new TRPCError({
						cause: error,
						code:
							error instanceof Error && error.message === "Purchase not found"
								? "NOT_FOUND"
								: "INTERNAL_SERVER_ERROR",
						message: error instanceof Error ? error.message : "Updating purchase failed",
					});
				}
			}),
	});
}
export const purchase = buildPurchaseRouter(adminProcedure);
export const purchaseBot = buildPurchaseRouter(botProcedure);
