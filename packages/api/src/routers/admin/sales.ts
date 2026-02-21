import { TRPCError } from "@trpc/server";
import { orderQueries, salesQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminCachedProcedure, router } from "../../lib/trpc";

export const sales = router({
	analytics: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const analyticsDaily = salesQueries.admin.getAnalyticsForHome("daily");
			const analyticsWeekly = salesQueries.admin.getAnalyticsForHome("weekly");
			const analyticsMonthly =
				salesQueries.admin.getAnalyticsForHome("monthly");
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
			return result;
		} catch (error) {
			ctx.log.error("analytics", error);
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
				const result = await salesQueries.admin.getMostSoldProducts(
					input.timeRange,
					input.productCount,
				);
				return result;
			} catch (error) {
				ctx.log.error("topProducts", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top products",
					cause: error,
				});
			}
		}),

	weeklyOrders: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			return await orderQueries.admin.getOrderCountForWeek();
		} catch (error) {
			ctx.log.error("weeklyOrders", error);
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
				return await orderQueries.admin.getAverageOrderValue(input.timeRange);
			} catch (error) {
				ctx.log.error("avgOrderValue", error);
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
				return await orderQueries.admin.getOrderCount(input.timeRange);
			} catch (error) {
				ctx.log.error("orderCount", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order count",
					cause: error,
				});
			}
		}),

	pendingOrders: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			return await orderQueries.admin.getPendingOrders();
		} catch (error) {
			ctx.log.error("pendingOrders", error);
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
				salesQueries.admin.getAnalyticsForHome("daily"),
				salesQueries.admin.getAnalyticsForHome("weekly"),
				salesQueries.admin.getAnalyticsForHome("monthly"),
				salesQueries.admin.getMostSoldProducts("daily", 5),
				salesQueries.admin.getMostSoldProducts("weekly", 5),
				salesQueries.admin.getMostSoldProducts("monthly", 5),
				orderQueries.admin.getOrderCount("daily"),
				orderQueries.admin.getOrderCount("weekly"),
				orderQueries.admin.getOrderCount("monthly"),
				orderQueries.admin.getPendingOrders(),
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
			ctx.log.error("dashboard", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch dashboard data",
				cause: error,
			});
		}
	}),
});
