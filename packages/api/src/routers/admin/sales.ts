import { TRPCError } from "@trpc/server";
import { adminQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminCachedProcedure, router } from "../../lib/trpc";

export const sales = router({
	analytics: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const q = adminQueries(ctx.db);
			const analyticsDaily = q.getAnalyticsForHome("daily");
			const analyticsWeekly = q.getAnalyticsForHome("weekly");
			const analyticsMonthly = q.getAnalyticsForHome("monthly");
			const analytics = await Promise.all([
				analyticsDaily,
				analyticsWeekly,
				analyticsMonthly,
			]);
			const result = {
				daily: analytics[0],
				weekly: analytics[1],
				monthly: analytics[2],
			};
			console.log("sales.analytics result:", result);
			return result;
		} catch (error) {
			console.error("Error getting analytics for home:", error);
			console.error("Error details:", JSON.stringify(error, null, 2));
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
				const q = adminQueries(ctx.db);
				const result = await q.getMostSoldProducts(
					input.timeRange,
					input.productCount,
				);
				console.log("topProducts result:", result);
				return result;
			} catch (error) {
				console.error("Error getting most sold products:", error);
				console.error("Error details:", JSON.stringify(error, null, 2));
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top products",
					cause: error,
				});
			}
		}),

	weeklyOrders: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const q = adminQueries(ctx.db);
			return await q.getOrderCountForWeek();
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
				const q = adminQueries(ctx.db);
				return await q.getAverageOrderValue(input.timeRange);
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
				const q = adminQueries(ctx.db);
				return await q.getOrderCount(input.timeRange);
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
			const q = adminQueries(ctx.db);
			return await q.getPendingOrders();
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
			const q = adminQueries(ctx.db);
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
				q.getAnalyticsForHome("daily"),
				q.getAnalyticsForHome("weekly"),
				q.getAnalyticsForHome("monthly"),
				q.getMostSoldProducts("daily", 5),
				q.getMostSoldProducts("weekly", 5),
				q.getMostSoldProducts("monthly", 5),
				q.getOrderCount("daily"),
				q.getOrderCount("weekly"),
				q.getOrderCount("monthly"),
				q.getPendingOrders(),
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
