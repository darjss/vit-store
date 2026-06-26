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
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "analytics"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch analytics",
                cause: error,
            });
        }
    }),
    topProducts: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
        productCount: v.number(),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await salesQueries.admin.getMostSoldProducts(input.timeRange, input.productCount);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "topProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch top products",
                cause: error,
            });
        }
    }),
    weeklyOrders: cachedProc.query(async ({ ctx }) => {
        try {
            return await orderQueries.admin.getOrderCountForWeek();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "weeklyOrders"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch weekly orders",
                cause: error,
            });
        }
    }),
    avgOrderValue: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            return await orderQueries.admin.getAverageOrderValue(input.timeRange);
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "avgOrderValue"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch average order value",
                cause: error,
            });
        }
    }),
    orderCount: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            return await orderQueries.admin.getOrderCount(input.timeRange);
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "orderCount"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch order count",
                cause: error,
            });
        }
    }),
    pendingOrders: cachedProc.query(async ({ ctx }) => {
        try {
            return await orderQueries.admin.getPendingOrders();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "pendingOrders"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch pending orders",
                cause: error,
            });
        }
    }),
    dashboard: cachedProc.query(async ({ ctx }) => {
        try {
            const [salesDaily, salesWeekly, salesMonthly, mostSoldProductsDaily, mostSoldProductsWeekly, mostSoldProductsMonthly, dailyOrders, weeklyOrders, monthlyOrders, pendingOrders,] = await Promise.all([
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
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "dashboard"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch dashboard data",
                cause: error,
            });
        }
    }),
});
}
export const sales = buildSalesRouter(adminCachedProcedure);
export const salesBot = buildSalesRouter(botCachedProcedure);
