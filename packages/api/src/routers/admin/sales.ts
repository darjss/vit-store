import { TRPCError } from "@trpc/server";
import { timeRangeSchema } from "@vit/shared/schema";
import { adminQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminCachedProcedure, router } from "../../lib/trpc";

export const sales = router({
	analytics: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const analyticsDaily = adminQueries.getAnalyticsForHome("daily");
			const analyticsWeekly = adminQueries.getAnalyticsForHome("weekly");
			const analyticsMonthly = adminQueries.getAnalyticsForHome("monthly");
			const analytics = await Promise.all([
				analyticsDaily,
				analyticsWeekly,
				analyticsMonthly,
			]);
			return {
				daily: analytics[0],
				weekly: analytics[1],
				monthly: analytics[2],
			};
		} catch (error) {
			console.error("Error getting analytics for home:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch analytics",
				cause: error,
			});
		}
	}),

	topProducts: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
				productCount: v.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await adminQueries.getMostSoldProducts(
					input.timeRange,
					input.productCount,
				);
			} catch (error) {
				console.error("Error getting most sold products:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top products",
					cause: error,
				});
			}
		}),

	weeklyOrders: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			return await adminQueries.getOrderCountForWeek();
		} catch (error) {
			console.error("Error getting order count for week:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch weekly orders",
				cause: error,
			});
		}
	}),

	avgOrderValue: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await adminQueries.getAverageOrderValue(input.timeRange);
			} catch (error) {
				console.error("Error getting average order value:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch average order value",
					cause: error,
				});
			}
		}),

	orderCount: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await adminQueries.getOrderCount(input.timeRange);
			} catch (error) {
				console.error("Error getting order count:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order count",
					cause: error,
				});
			}
		}),

	pendingOrders: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			return await adminQueries.getPendingOrders();
		} catch (error) {
			console.error("Error getting pending orders:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch pending orders",
				cause: error,
			});
		}
	}),

	dashboard: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const [
				salesDaily,
				salesWeekly,
				salesMonthly,
				mostSoldProductsDaily,
				mostSoldProductsWeekly,
				mostSoldProductsMonthly,
				dailyOrders,
				weeklyOrders,
				monthlyOrders,
				pendingOrders,
			] = await Promise.all([
				adminQueries.getAnalyticsForHome("daily"),
				adminQueries.getAnalyticsForHome("weekly"),
				adminQueries.getAnalyticsForHome("monthly"),
				adminQueries.getMostSoldProducts("daily"),
				adminQueries.getMostSoldProducts("weekly"),
				adminQueries.getMostSoldProducts("monthly"),
				adminQueries.getOrderCount("daily"),
				adminQueries.getOrderCount("weekly"),
				adminQueries.getOrderCount("monthly"),
				adminQueries.getPendingOrders(),
			]);

			const dashboardData = {
				salesData: {
					daily: salesDaily,
					weekly: salesWeekly,
					monthly: salesMonthly,
				},
				mostSoldProducts: {
					daily: mostSoldProductsDaily,
					weekly: mostSoldProductsWeekly,
					monthly: mostSoldProductsMonthly,
				},
				orderCounts: {
					daily: dailyOrders,
					weekly: weeklyOrders,
					monthly: monthlyOrders,
				},
				pendingOrders: pendingOrders,
			};

			return dashboardData;
		} catch (error) {
			console.error("Error fetching dashboard homepage data:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch dashboard data",
				cause: error,
			});
		}
	}),
});
