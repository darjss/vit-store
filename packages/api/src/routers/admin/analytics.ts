import { TRPCError } from "@trpc/server";
import { adminQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminCachedProcedure, router } from "../../lib/trpc";

export const analytics = router({
	getAverageOrderValue: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getAverageOrderValue(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getAverageOrderValue:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch average order value",
					cause: error,
				});
			}
		}),

	getTotalProfit: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getTotalProfit(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getTotalProfit:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch total profit",
					cause: error,
				});
			}
		}),

	getSalesByCategory: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getSalesByCategory(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getSalesByCategory:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch sales by category",
					cause: error,
				});
			}
		}),

	getCustomerLifetimeValue: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await adminQueries.getCustomerLifetimeValue();
			return result;
		} catch (error) {
			console.error("Error in getCustomerLifetimeValue:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch customer lifetime value",
				cause: error,
			});
		}
	}),

	getRepeatCustomersCount: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getRepeatCustomersCount(
					input.timeRange,
				);
				return result;
			} catch (error) {
				console.error("Error in getRepeatCustomersCount:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch repeat customers count",
					cause: error,
				});
			}
		}),

	getInventoryStatus: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await adminQueries.getInventoryStatus();
			return result;
		} catch (error) {
			console.error("Error in getInventoryStatus:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch inventory status",
				cause: error,
			});
		}
	}),

	getFailedPayments: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getFailedPayments(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getFailedPayments:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch failed payments",
					cause: error,
				});
			}
		}),

	getLowInventoryProducts: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await adminQueries.getLowInventoryProducts();
			return result;
		} catch (error) {
			console.log(error);
			console.error("Error in getLowInventoryProducts:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch low inventory products",
				cause: error,
			});
		}
	}),

	getTopBrandsBySales: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getTopBrandsBySales(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getTopBrandsBySales:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top brands by sales",
					cause: error,
				});
			}
		}),

	getCurrentProductsValue: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await adminQueries.getCurrentProductsValue();
			return result;
		} catch (error) {
			console.error("Error in getCurrentProductsValue:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch current products value",
				cause: error,
			});
		}
	}),

	getAnalyticsData: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await adminQueries.getAnalyticsData(input.timeRange);
				return result;
			} catch (error) {
				console.error("Error in getAnalyticsData:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch analytics data",
					cause: error,
				});
			}
		}),
	getHomePageData: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ input }) => {
			try {
				const timeRange = input.timeRange;
				const _pendingOrders = await adminQueries.getPendingOrders();
				const _revenue = await adminQueries.getRevenue(timeRange);
				const _orderCount = await adminQueries.getOrderCount(timeRange);
				return {
					pendingOrders: _pendingOrders,
					revenue: _revenue,
					orderCount: _orderCount,
				};
			} catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch home page data",
					cause: e,
				});
			}
		}),
});
