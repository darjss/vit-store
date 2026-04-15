import { TRPCError } from "@trpc/server";
import { purchaseQueries } from "@vit/api/queries";
import {
	addPurchaseSchema,
	listPurchasesSchema,
	receivePurchaseSchema,
} from "@vit/shared/schema";
import * as v from "valibot";
import { db } from "../../db/client";
import { adminProcedure, router } from "../../lib/trpc";

export const purchase = router({
	addPurchase: adminProcedure
		.input(addPurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await db().transaction(async (tx) => {
					const result = await purchaseQueries.admin.createPurchase(tx, input);
					return {
						id: result.id,
						message: "Purchase added successfully",
					};
				});
			} catch (e) {
				ctx.log.error("addPurchase", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Adding purchase failed",
					cause: e,
				});
			}
		}),

	getAllPurchases: adminProcedure.query(async ({ ctx }) => {
		try {
			return await purchaseQueries.admin.getAllPurchases();
		} catch (e) {
			ctx.log.error("getAllPurchases", e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Fetching purchases failed",
				cause: e,
			});
		}
	}),

	getPurchaseById: adminProcedure
		.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
		.query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.getPurchaseById(input.id);
			} catch (e) {
				ctx.log.error("getPurchaseById", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchase failed",
					cause: e,
				});
			}
		}),

	getPaginatedPurchases: adminProcedure
		.input(listPurchasesSchema)
		.query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.getPaginatedPurchases(input);
			} catch (e) {
				ctx.log.error("getPaginatedPurchases", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
					cause: e,
				});
			}
		}),

	searchPurchases: adminProcedure
		.input(v.object({ query: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.searchPurchases(input.query);
			} catch (e) {
				ctx.log.error("searchPurchases", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Searching purchases failed",
					cause: e,
				});
			}
		}),

	updatePurchase: adminProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				data: addPurchaseSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.updatePurchase(tx, input.id, input.data);
				});
				return { message: "Purchase updated successfully" };
			} catch (e) {
				ctx.log.error("updatePurchase", e);
				throw new TRPCError({
					code:
						e instanceof Error && e.message === "Purchase not found"
							? "NOT_FOUND"
							: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Updating purchase failed",
					cause: e,
				});
			}
		}),

	receivePurchase: adminProcedure
		.input(receivePurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.receivePurchase(tx, input);
				});
				return { message: "Purchase received successfully" };
			} catch (e) {
				ctx.log.error("receivePurchase", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Receiving purchase failed",
					cause: e,
				});
			}
		}),

	deletePurchase: adminProcedure
		.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.deletePurchase(tx, input.id);
				});
				return { message: "Purchase deleted successfully" };
			} catch (e) {
				ctx.log.error("deletePurchase", e);
				throw new TRPCError({
					code:
						e instanceof Error && e.message === "Purchase not found"
							? "NOT_FOUND"
							: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Deleting purchase failed",
					cause: e,
				});
			}
		}),

	cancelPurchase: adminProcedure
		.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.cancelPurchase(tx, input.id);
				});
				return { message: "Purchase cancelled successfully" };
			} catch (e) {
				ctx.log.error("cancelPurchase", e);
				throw new TRPCError({
					code:
						e instanceof Error && e.message === "Purchase not found"
							? "NOT_FOUND"
							: "INTERNAL_SERVER_ERROR",
					message:
						e instanceof Error ? e.message : "Cancelling purchase failed",
					cause: e,
				});
			}
		}),

	markPurchaseShipped: adminProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				shippedAt: v.date(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.markPurchaseShipped(
						tx,
						input.id,
						input.shippedAt,
					);
				});
				return { message: "Purchase marked as shipped" };
			} catch (e) {
				ctx.log.error("markPurchaseShipped", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Updating shipment status failed",
					cause: e,
				});
			}
		}),

	markPurchaseForwarderReceived: adminProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				forwarderReceivedAt: v.date(),
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
			} catch (e) {
				ctx.log.error("markPurchaseForwarderReceived", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Updating forwarder receipt failed",
					cause: e,
				});
			}
		}),

	getAverageCostOfProduct: adminProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				createdAt: v.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.getAverageCostOfProduct(
					input.productId,
					input.createdAt,
				);
			} catch (e) {
				ctx.log.error("getAverageCostOfProduct", e);
				return 0;
			}
		}),
});
