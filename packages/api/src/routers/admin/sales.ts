import { TRPCError } from "@trpc/server";
import { orderQueries, salesQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminCachedProcedure, baseProcedure, botCachedProcedure, router } from "~/lib/trpc";
export function buildSalesRouter<P extends typeof baseProcedure>(cachedProc: P) {
	return router({
		analytics: cachedProc.query(async ({ ctx }) => {
			try {
				const analyticsDaily = salesQueries.admin.getAnalyticsForHome("daily");
				const analyticsWeekly = salesQueries.admin.getAnalyticsForHome("weekly");
				const analyticsMonthly = salesQueries.admin.getAnalyticsForHome("monthly");
				const analytics = await Promise.all([analyticsDaily, analyticsWeekly, analyticsMonthly]);
				const result = {
					daily: analytics[0],
					monthly: analytics[2],
					weekly: analytics[1],
				};
				return result;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "analytics",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch analytics",
				});
			}
		}),
		avgOrderValue: cachedProc
			.input(
				v.object({
					timeRange: timeRangeSchema,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await orderQueries.admin.getAverageOrderValue(input.timeRange);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "avgOrderValue",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch average order value",
					});
				}
			}),
		dashboard: cachedProc.query(async ({ ctx }) => {
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
					mostSoldProducts: {
						daily: mostSoldProductsDaily,
						monthly: mostSoldProductsMonthly,
						weekly: mostSoldProductsWeekly,
					},
					orderCounts: {
						daily: dailyOrders,
						monthly: monthlyOrders,
						weekly: weeklyOrders,
					},
					pendingOrders,
					salesData: {
						daily: salesDaily,
						monthly: salesMonthly,
						weekly: salesWeekly,
					},
				};
				return dashboardData;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "dashboard",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch dashboard data",
				});
			}
		}),
		orderCount: cachedProc
			.input(
				v.object({
					timeRange: timeRangeSchema,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await orderQueries.admin.getOrderCount(input.timeRange);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "orderCount",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch order count",
					});
				}
			}),
		pendingOrders: cachedProc.query(async ({ ctx }) => {
			try {
				return await orderQueries.admin.getPendingOrders();
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "pendingOrders",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch pending orders",
				});
			}
		}),
		topProducts: cachedProc
			.input(
				v.object({
					productCount: v.number(),
					timeRange: timeRangeSchema,
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
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "topProducts",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch top products",
					});
				}
			}),
		weeklyOrders: cachedProc.query(async ({ ctx }) => {
			try {
				return await orderQueries.admin.getOrderCountForWeek();
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "weeklyOrders",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch weekly orders",
				});
			}
		}),
	});
}
export const sales = buildSalesRouter(adminCachedProcedure);
export const salesBot = buildSalesRouter(botCachedProcedure);
