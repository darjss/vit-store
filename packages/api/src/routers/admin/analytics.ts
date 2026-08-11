import { TRPCError } from "@trpc/server";
import { analyticsQueries, orderQueries, salesQueries } from "@vit/api/queries";
import { timeRangeSchema, type timeRangeType } from "@vit/shared/schema";
import * as v from "valibot";
import { createPostHogClient, type PostHogRange } from "~/lib/integrations/posthog";
import { adminCachedProcedure, adminProcedure, baseProcedure, botCachedProcedure, botProcedure, router } from "~/lib/trpc";
import { getTimeRangeBounds } from "~/lib/utils";

/** Exact Asia/Ulaanbaatar-aligned window for a time range, as UTC instants. */
function ubRange(timeRange: timeRangeType): PostHogRange {
	const { start, end } = getTimeRangeBounds(timeRange);
	return { startIso: start.toISOString(), endIso: end.toISOString() };
}
export function buildAnalyticsRouter<P extends typeof baseProcedure>(proc: P, cachedProc: P) {
    return router({
    getAverageOrderValue: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getAverageOrderValue(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAverageOrderValue"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch average order value",
                cause: error,
            });
        }
    }),
    getTotalProfit: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getTotalProfit(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getTotalProfit"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch total profit",
                cause: error,
            });
        }
    }),
    getSalesByCategory: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getSalesByCategory(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getSalesByCategory"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch sales by category",
                cause: error,
            });
        }
    }),
    getCustomerLifetimeValue: cachedProc.query(async ({ ctx }) => {
        try {
            const result = await analyticsQueries.admin.getCustomerLifetimeValue();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getCustomerLifetimeValue"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch customer lifetime value",
                cause: error,
            });
        }
    }),
    getRepeatCustomersCount: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getRepeatCustomersCount(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getRepeatCustomersCount"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch repeat customers count",
                cause: error,
            });
        }
    }),
    getInventoryStatus: proc.query(async ({ ctx }) => {
        try {
            const result = await analyticsQueries.admin.getInventoryStatus();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getInventoryStatus"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch inventory status",
                cause: error,
            });
        }
    }),
    getFailedPayments: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getFailedPayments(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getFailedPayments"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch failed payments",
                cause: error,
            });
        }
    }),
    getLowInventoryProducts: proc.query(async ({ ctx }) => {
        try {
            const result = await analyticsQueries.admin.getLowInventoryProducts();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getLowInventoryProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch low inventory products",
                cause: error,
            });
        }
    }),
    getTopBrandsBySales: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getTopBrandsBySales(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getTopBrandsBySales"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch top brands by sales",
                cause: error,
            });
        }
    }),
    getCurrentProductsValue: cachedProc.query(async ({ ctx }) => {
        try {
            const result = await analyticsQueries.admin.getCurrentProductsValue();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getCurrentProductsValue"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch current products value",
                cause: error,
            });
        }
    }),
    getAnalyticsData: cachedProc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const result = await analyticsQueries.admin.getAnalyticsData(input.timeRange);
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getAnalyticsData"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch analytics data",
                cause: error,
            });
        }
    }),
    getHomePageData: proc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const timeRange = input.timeRange;
            // Home is the work queue + glance cards: pending orders and low
            // stock must be fresh (uncached), historical metrics may lag.
            const [
                pendingOrders,
                revenue,
                orderCount,
                lowStockProducts,
                topProducts,
                recentOrders,
            ] = await Promise.all([
                orderQueries.admin.getPendingOrders(),
                salesQueries.admin.getRevenue(timeRange),
                orderQueries.admin.getOrderCount(timeRange),
                analyticsQueries.admin.getLowInventoryProducts(),
                salesQueries.admin.getMostSoldProducts("monthly", 5),
                orderQueries.admin.getRecentOrders(8),
            ]);
            return {
                pendingOrders,
                revenue,
                orderCount,
                lowStockProducts,
                topProducts,
                recentOrders,
            };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "getHomePageData"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch home page data",
                cause: e,
            });
        }
    }),
    // ─── PostHog-backed analytics endpoints ────────────────────────────
    /**
     * Web analytics overview: visitors, pageviews, funnel counts, and comparison with previous period.
     */
    getWebAnalytics: proc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            const range = ubRange(input.timeRange);
            // Run sequentially to stay within PostHog's concurrent query limit (3)
            const current = await posthog.getWebAnalytics(range);
            const previous = await posthog.getWebAnalyticsPrevious(range);
            const calcChange = (curr: number, prev: number) => {
                if (prev === 0)
                    return curr > 0 ? 100 : 0;
                return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
            };
            return {
                current,
                previous,
                changes: {
                    visitors: calcChange(current.uniqueVisitors, previous.uniqueVisitors),
                    pageviews: calcChange(current.pageviews, previous.pageviews),
                    orders: calcChange(current.orders, previous.orders),
                },
            };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getWebAnalytics"
            });
            // No fabricated zero fallback: the caller shows an unavailable state.
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Web analytics unavailable",
                cause: error,
            });
        }
    }),
    /**
     * Conversion funnel: unique users at each step.
     */
    getConversionFunnel: proc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            return await posthog.getConversionFunnel(ubRange(input.timeRange));
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getConversionFunnel"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Conversion funnel unavailable",
                cause: error,
            });
        }
    }),
    /**
     * Top search queries with result counts and no-result searches.
     */
    getTopSearches: proc
        .input(v.object({
        timeRange: timeRangeSchema,
        limit: v.optional(v.number(), 20),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            return await posthog.getTopSearches(ubRange(input.timeRange), input.limit);
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getTopSearches"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Top searches unavailable",
                cause: error,
            });
        }
    }),
    /**
     * Most viewed products from PostHog events.
     */
    getMostViewedProducts: proc
        .input(v.object({
        timeRange: timeRangeSchema,
        limit: v.optional(v.number(), 20),
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            return await posthog.getMostViewedProducts(ubRange(input.timeRange), input.limit);
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getMostViewedProducts"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Most-viewed products unavailable",
                cause: error,
            });
        }
    }),
    /**
     * Per-product behavior analytics (views, add-to-cart, daily trend).
     */
    getProductBehavior: proc
        .input(v.object({
        productId: v.number(),
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            return await posthog.getProductBehavior(input.productId, ubRange(input.timeRange));
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getProductBehavior"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Product behavior unavailable",
                cause: error,
            });
        }
    }),
    /**
     * Daily visitor trend for chart display.
     */
    getDailyVisitorTrend: proc
        .input(v.object({
        timeRange: timeRangeSchema,
    }))
        .query(async ({ ctx, input }) => {
        try {
            const posthog = createPostHogClient(ctx.c.env);
            return await posthog.getDailyVisitorTrend(ubRange(input.timeRange));
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getDailyVisitorTrend"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Visitor trend unavailable",
                cause: error,
            });
        }
    }),
});
}
export const analytics = buildAnalyticsRouter(adminProcedure, adminCachedProcedure);
export const analyticsBot = buildAnalyticsRouter(botProcedure, botCachedProcedure);
