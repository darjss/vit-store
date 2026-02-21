import { TRPCError } from "@trpc/server";
import { purchaseQueries } from "@vit/api/queries";
import { addPurchaseSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { db } from "../../db/client";
import { adminProcedure, router } from "../../lib/trpc";

export const purchase = router({
	addPurchase: adminProcedure
		.input(addPurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.addPurchaseWithStockUpdate(
						tx,
						input.products,
					);
				});

				return { message: "Purchase added successfully" };
			} catch (e) {
				ctx.log.error("addPurchase", e);
				if (e instanceof Error && e.message === "Purchase not found") {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: e.message,
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Adding purchase failed",
					cause: e,
				});
			}
		}),

	getAllPurchases: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await purchaseQueries.admin.getAllPurchases();
			return result;
		} catch (e) {
			ctx.log.error("getPurchaseById", e);
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
				const result = await purchaseQueries.admin.getPurchaseById(input.id);
				return result;
			} catch (e) {
				ctx.log.error("getAllPurchases", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchase failed",
					cause: e,
				});
			}
		}),

	getPaginatedPurchases: adminProcedure
		.input(
			v.object({
				page: v.pipe(v.number(), v.integer(), v.minValue(1)),
				pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
				productId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				sortField: v.optional(v.string()),
				sortDirection: v.picklist(["asc", "desc"]),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await purchaseQueries.admin.getPaginatedPurchases({
					page: input.page,
					pageSize: input.pageSize,
					productId: input.productId,
					sortField: input.sortField,
					sortDirection: input.sortDirection,
				});
			} catch (e) {
				ctx.log.error("getPaginatedPurchases", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
					cause: e,
				});
			}
		}),

	searchPurchaseByProductName: adminProcedure
		.input(v.object({ query: v.string() }))
		.query(async ({ ctx, input }) => {
			if (!input.query) return [];
			try {
				const results = await purchaseQueries.admin.searchByProductName(
					input.query,
				);
				return results;
			} catch (e) {
				ctx.log.error("searchPurchaseByProductName", e);
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
					await purchaseQueries.admin.updatePurchaseWithStockAdjustment(
						tx,
						input.id,
						input.data.products,
					);
				});
				return { message: "Purchase updated successfully" };
			} catch (e) {
				ctx.log.error("updatePurchase", e);
				if (e instanceof Error && e.message === "Purchase not found") {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: e.message,
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Updating purchase failed",
					cause: e,
				});
			}
		}),

	deletePurchase: adminProcedure
		.input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
		.mutation(async ({ ctx, input }) => {
			try {
				await db().transaction(async (tx) => {
					await purchaseQueries.admin.deletePurchaseWithStockRestore(
						tx,
						input.id,
					);
				});
				return { message: "Purchase deleted successfully" };
			} catch (e) {
				ctx.log.error("deletePurchase", e);
				if (e instanceof Error && e.message === "Purchase not found") {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: e.message,
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Deleting purchase failed",
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
