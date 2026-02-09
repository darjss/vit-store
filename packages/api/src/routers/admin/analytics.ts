import { TRPCError } from "@trpc/server";
import { analyticsQueries, orderQueries, salesQueries } from "@vit/api/queries";
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getAverageOrderValue(
					input.timeRange,
				);
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getTotalProfit(
					input.timeRange,
				);
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getSalesByCategory(
					input.timeRange,
				);
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

	getCustomerLifetimeValue: adminCachedProcedure.query(async () => {
		try {
			const result = await analyticsQueries.admin.getCustomerLifetimeValue();
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getRepeatCustomersCount(
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

	getInventoryStatus: adminCachedProcedure.query(async () => {
		try {
			const result = await analyticsQueries.admin.getInventoryStatus();
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getFailedPayments(
					input.timeRange,
				);
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

	getLowInventoryProducts: adminCachedProcedure.query(async () => {
		try {
			const result = await analyticsQueries.admin.getLowInventoryProducts();
			console.log("getLowInventoryProducts result:", result);
			return result;
		} catch (error) {
			console.error("Error in getLowInventoryProducts:", error);
			console.error("Error details:", JSON.stringify(error, null, 2));
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getTopBrandsBySales(
					input.timeRange,
				);
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

	getCurrentProductsValue: adminCachedProcedure.query(async () => {
		try {
			const result = await analyticsQueries.admin.getCurrentProductsValue();
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
		.query(async ({ input }) => {
			try {
				const result = await analyticsQueries.admin.getAnalyticsData(
					input.timeRange,
				);
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
				const _pendingOrders = await orderQueries.admin.getPendingOrders();
				const _revenue = await salesQueries.admin.getRevenue(timeRange);
				const _orderCount = await orderQueries.admin.getOrderCount(timeRange);
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
