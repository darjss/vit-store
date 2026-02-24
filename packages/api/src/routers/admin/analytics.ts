import { TRPCError } from "@trpc/server";
import { analyticsQueries, orderQueries, salesQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { createPostHogClient } from "../../lib/integrations/posthog";
import { adminCachedProcedure, adminProcedure, router } from "../../lib/trpc";

/** Convert timeRange to days for PostHog queries */
function timeRangeToDays(timeRange: "daily" | "weekly" | "monthly"): number {
	switch (timeRange) {
		case "daily":
			return 1;
		case "weekly":
			return 7;
		case "monthly":
			return 30;
	}
}

export const analytics = router({
	getAverageOrderValue: adminCachedProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const result = await analyticsQueries.admin.getAverageOrderValue(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getAverageOrderValue", error);
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
				const result = await analyticsQueries.admin.getTotalProfit(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getTotalProfit", error);
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
				const result = await analyticsQueries.admin.getSalesByCategory(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getSalesByCategory", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch sales by category",
					cause: error,
				});
			}
		}),

	getCustomerLifetimeValue: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await analyticsQueries.admin.getCustomerLifetimeValue();
			return result;
		} catch (error) {
			ctx.log.error("getCustomerLifetimeValue", error);
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
				const result = await analyticsQueries.admin.getRepeatCustomersCount(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getRepeatCustomersCount", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch repeat customers count",
					cause: error,
				});
			}
		}),

	getInventoryStatus: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await analyticsQueries.admin.getInventoryStatus();
			return result;
		} catch (error) {
			ctx.log.error("getInventoryStatus", error);
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
				const result = await analyticsQueries.admin.getFailedPayments(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getFailedPayments", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch failed payments",
					cause: error,
				});
			}
		}),

	getLowInventoryProducts: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await analyticsQueries.admin.getLowInventoryProducts();
			return result;
		} catch (error) {
			ctx.log.error("getLowInventoryProducts", error);
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
				const result = await analyticsQueries.admin.getTopBrandsBySales(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getTopBrandsBySales", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top brands by sales",
					cause: error,
				});
			}
		}),

	getCurrentProductsValue: adminCachedProcedure.query(async ({ ctx }) => {
		try {
			const result = await analyticsQueries.admin.getCurrentProductsValue();
			return result;
		} catch (error) {
			ctx.log.error("getCurrentProductsValue", error);
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
				const result = await analyticsQueries.admin.getAnalyticsData(
					input.timeRange,
				);
				return result;
			} catch (error) {
				ctx.log.error("getAnalyticsData", error);
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
		.query(async ({ ctx, input }) => {
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
				ctx.log.error("getHomePageData", e);
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
	getWebAnalytics: adminProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);

				// Run sequentially to stay within PostHog's concurrent query limit (3)
				const current = await posthog.getWebAnalytics(days);
				const previous = await posthog.getWebAnalyticsPrevious(days);

				const calcChange = (curr: number, prev: number) => {
					if (prev === 0) return curr > 0 ? 100 : 0;
					return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
				};

				return {
					current,
					previous,
					changes: {
						visitors: calcChange(
							current.uniqueVisitors,
							previous.uniqueVisitors,
						),
						pageviews: calcChange(current.pageviews, previous.pageviews),
						orders: calcChange(current.orders, previous.orders),
					},
				};
			} catch (error) {
				ctx.log.error("getWebAnalytics", error);
				// Return zeros instead of throwing — graceful fallback
				return {
					current: {
						uniqueVisitors: 0,
						pageviews: 0,
						productViews: 0,
						addToCarts: 0,
						checkouts: 0,
						orders: 0,
						payments: 0,
						searches: 0,
					},
					previous: {
						uniqueVisitors: 0,
						pageviews: 0,
						orders: 0,
					},
					changes: {
						visitors: 0,
						pageviews: 0,
						orders: 0,
					},
				};
			}
		}),

	/**
	 * Conversion funnel: unique users at each step.
	 */
	getConversionFunnel: adminProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);
				return await posthog.getConversionFunnel(days);
			} catch (error) {
				ctx.log.error("getConversionFunnel", error);
				return {
					visitors: 0,
					productViewers: 0,
					cartAdders: 0,
					checkoutStarters: 0,
					orderPlacers: 0,
					paymentConfirmers: 0,
				};
			}
		}),

	/**
	 * Top search queries with result counts and no-result searches.
	 */
	getTopSearches: adminProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
				limit: v.optional(v.number(), 20),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);
				return await posthog.getTopSearches(days, input.limit);
			} catch (error) {
				ctx.log.error("getTopSearches", error);
				return [];
			}
		}),

	/**
	 * Most viewed products from PostHog events.
	 */
	getMostViewedProducts: adminProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
				limit: v.optional(v.number(), 20),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);
				return await posthog.getMostViewedProducts(days, input.limit);
			} catch (error) {
				ctx.log.error("getMostViewedProducts", error);
				return [];
			}
		}),

	/**
	 * Per-product behavior analytics (views, add-to-cart, daily trend).
	 */
	getProductBehavior: adminProcedure
		.input(
			v.object({
				productId: v.number(),
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);
				return await posthog.getProductBehavior(input.productId, days);
			} catch (error) {
				ctx.log.error("getProductBehavior", error);
				return {
					views: 0,
					uniqueViewers: 0,
					addToCartCount: 0,
					searchClicks: 0,
					dailyTrend: [],
				};
			}
		}),

	/**
	 * Daily visitor trend for chart display.
	 */
	getDailyVisitorTrend: adminProcedure
		.input(
			v.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const posthog = createPostHogClient(ctx.c.env);
				const days = timeRangeToDays(input.timeRange);
				return await posthog.getDailyVisitorTrend(days);
			} catch (error) {
				ctx.log.error("getDailyVisitorTrend", error);
				return [];
			}
		}),
});
