import { TRPCError } from "@trpc/server";
import {
	addPurchaseSchema,
	listPurchasesSchema,
	receivePurchaseSchema,
} from "@vit/shared";
import * as v from "valibot";
import { db } from "~/db/client";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	cancelPurchase,
	createPurchase,
	deletePurchase,
	markPurchaseForwarderReceived,
	markPurchaseShipped,
	purchaseCreatedResultSchemas,
	purchaseErrorToLegacyTrpc,
	purchaseMutationResultSchemas,
	receivePurchase,
	updatePurchase,
} from "~/operations/purchase";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { getAverageCostOfProduct } from "~/queries/payments";
import { purchaseQueries } from "~/queries/purchases";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const purchaseIdSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const updatePurchaseInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	data: addPurchaseSchema,
});

const markShippedInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	shippedAt: v.date(),
});

const markForwarderReceivedInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	forwarderReceivedAt: v.date(),
});

export function buildPurchaseRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addPurchase: proc
			.input(addPurchaseSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addPurchase",
					"Adding purchase failed",
					() => createPurchase(input),
					purchaseErrorToLegacyTrpc,
				),
			),
		getAllPurchases: proc.query(async ({ ctx }) => {
			try {
				return await purchaseQueries.admin.getAllPurchases();
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getAllPurchases",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
					cause: error,
				});
			}
		}),
		getPurchaseById: proc
			.input(purchaseIdSchema)
			.query(async ({ ctx, input }) => {
				try {
					return await purchaseQueries.admin.getPurchaseById(input.id);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{
							event: "getPurchaseById",
						},
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Fetching purchase failed",
						cause: error,
					});
				}
			}),
		getPaginatedPurchases: proc
			.input(listPurchasesSchema)
			.query(async ({ ctx, input }) => {
				try {
					return await purchaseQueries.admin.getPaginatedPurchases(input);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "getPaginatedPurchases" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Fetching purchases failed",
						cause: error,
					});
				}
			}),
		searchPurchases: proc
			.input(v.object({ query: v.string() }))
			.query(async ({ ctx, input }) => {
				try {
					return await purchaseQueries.admin.searchPurchases(input.query);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "searchPurchases" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Searching purchases failed",
						cause: error,
					});
				}
			}),
		updatePurchase: proc
			.input(updatePurchaseInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updatePurchase",
					"Updating purchase failed",
					() => updatePurchase(input.id, input.data),
					purchaseErrorToLegacyTrpc,
				),
			),
		receivePurchase: proc
			.input(receivePurchaseSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"receivePurchase",
					"Receiving purchase failed",
					() => receivePurchase(ctx, input),
					purchaseErrorToLegacyTrpc,
				),
			),
		deletePurchase: proc
			.input(purchaseIdSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deletePurchase",
					"Deleting purchase failed",
					() => deletePurchase(input.id),
					purchaseErrorToLegacyTrpc,
				),
			),
		cancelPurchase: proc
			.input(purchaseIdSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"cancelPurchase",
					"Cancelling purchase failed",
					() => cancelPurchase(input.id),
					purchaseErrorToLegacyTrpc,
				),
			),
		markPurchaseShipped: proc
			.input(markShippedInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"markPurchaseShipped",
					"Updating shipment status failed",
					() => markPurchaseShipped(input.id, input.shippedAt),
					purchaseErrorToLegacyTrpc,
				),
			),
		markPurchaseForwarderReceived: proc
			.input(markForwarderReceivedInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"markPurchaseForwarderReceived",
					"Updating forwarder receipt failed",
					() =>
						markPurchaseForwarderReceived(
							input.id,
							input.forwarderReceivedAt,
						),
					purchaseErrorToLegacyTrpc,
				),
			),
		getAverageCostOfProduct: proc
			.input(
				v.object({
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
					createdAt: v.date(),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await getAverageCostOfProduct(
						db(),
						input.productId,
						input.createdAt,
					);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "getAverageCostOfProduct" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Calculating average product cost failed",
						cause: error,
					});
				}
			}),
	});
}

export const purchaseV2 = router({
	addPurchase: adminProcedure
		.input(addPurchaseSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await createPurchase(input),
				purchaseCreatedResultSchemas,
				{ operation: "admin.purchase.add", error_layer: "domain" },
			),
		),
	updatePurchase: adminProcedure
		.input(updatePurchaseInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updatePurchase(input.id, input.data),
				purchaseMutationResultSchemas,
				{ operation: "admin.purchase.update", error_layer: "domain" },
			),
		),
	receivePurchase: adminProcedure
		.input(receivePurchaseSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await receivePurchase(ctx, input),
				purchaseMutationResultSchemas,
				{ operation: "admin.purchase.receive", error_layer: "domain" },
			),
		),
	deletePurchase: adminProcedure
		.input(purchaseIdSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deletePurchase(input.id),
				purchaseMutationResultSchemas,
				{ operation: "admin.purchase.delete", error_layer: "domain" },
			),
		),
	cancelPurchase: adminProcedure
		.input(purchaseIdSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await cancelPurchase(input.id),
				purchaseMutationResultSchemas,
				{ operation: "admin.purchase.cancel", error_layer: "domain" },
			),
		),
	markPurchaseShipped: adminProcedure
		.input(markShippedInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await markPurchaseShipped(input.id, input.shippedAt),
				purchaseMutationResultSchemas,
				{ operation: "admin.purchase.mark_shipped", error_layer: "domain" },
			),
		),
	markPurchaseForwarderReceived: adminProcedure
		.input(markForwarderReceivedInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await markPurchaseForwarderReceived(
					input.id,
					input.forwarderReceivedAt,
				),
				purchaseMutationResultSchemas,
				{
					operation: "admin.purchase.mark_forwarder_received",
					error_layer: "domain",
				},
			),
		),
});

export const purchase = buildPurchaseRouter(adminProcedure);
export const purchaseBot = buildPurchaseRouter(botProcedure);
