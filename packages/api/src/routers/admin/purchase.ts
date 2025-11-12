import { TRPCError } from "@trpc/server";
import { addPurchaseSchema } from "@vit/shared/schema";
import { adminQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";

export const purchase = router({
	addPurchase: adminProcedure
		.input(addPurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = adminQueries(ctx.db);
				await ctx.db.transaction(async (tx) => {
					await q.addPurchaseWithStockUpdate(tx, input.products);
				});

				return { message: "Purchase added successfully" };
			} catch (e) {
				console.error("Error adding purchase:", e);
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
			const q = adminQueries(ctx.db);
			const result = await q.getAllPurchases();
			return result;
		} catch (e) {
			console.error("error", e);
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
				const q = adminQueries(ctx.db);
				const result = await q.getPurchaseById(input.id);
				return result;
			} catch (e) {
				console.error("error", e);
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
				const q = adminQueries(ctx.db);
				return await q.getPaginatedPurchases({
					page: input.page,
					pageSize: input.pageSize,
					productId: input.productId,
					sortField: input.sortField,
					sortDirection: input.sortDirection,
				});
			} catch (e) {
				console.log("Error fetching paginated purchases:", e);
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
				const q = adminQueries(ctx.db);
				const results = await q.searchByProductName(input.query);
				return results;
			} catch (e) {
				console.error("Error searching purchases:", e);
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
				const q = adminQueries(ctx.db);
				await ctx.db.transaction(async (tx) => {
					await q.updatePurchaseWithStockAdjustment(
						tx,
						input.id,
						input.data.products,
					);
				});
				return { message: "Purchase updated successfully" };
			} catch (e) {
				console.error("Error updating purchase:", e);
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
				const q = adminQueries(ctx.db);
				await ctx.db.transaction(async (tx) => {
					await q.deletePurchaseWithStockRestore(tx, input.id);
				});
				return { message: "Purchase deleted successfully" };
			} catch (e) {
				console.error("Error deleting purchase:", e);
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
				const q = adminQueries(ctx.db);
				return await q.getAverageCostOfProduct(input.productId, input.createdAt);
			} catch (e) {
				console.error("Error calculating average cost:", e);
				return 0;
			}
		}),
});
