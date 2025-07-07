import { adminProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { timeRangeSchema } from "@/lib/zod/schema";
import { SalesTable, ProductsTable, ProductImagesTable } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDaysFromTimeRange } from "@/lib/utils";
import {
	getAnalyticsForHome,
	getMostSoldProducts,
	getOrderCountForWeek,
	getAverageOrderValue,
	getOrderCount,
	getPendingOrders,
} from "./utils";

export const sales = router({
	analytics: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await getAnalyticsForHome(ctx, input.timeRange);
			} catch (e) {
				console.log("Error getting analytics for home:", e);
				return { sum: 0, salesCount: 0, profit: 0 };
			}
		}),

	topProducts: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
				productCount: z.number().default(5),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await getMostSoldProducts(
					ctx,
					input.timeRange,
					input.productCount,
				);
			} catch (e) {
				console.log("Error getting most sold products:", e);
				return [];
			}
		}),

	weeklyOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			return await getOrderCountForWeek(ctx);
		} catch (e) {
			console.log("Error getting order count for week:", e);
			return [];
		}
	}),

	avgOrderValue: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await getAverageOrderValue(ctx, input.timeRange);
			} catch (e) {
				console.log("Error getting average order value:", e);
				return 0;
			}
		}),

	orderCount: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await getOrderCount(ctx, input.timeRange);
			} catch (e) {
				console.log("Error getting order count:", e);
				return { count: 0 };
			}
		}),

	pendingOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			return await getPendingOrders(ctx);
		} catch (e) {
			console.log("Error getting pending orders:", e);
			return [];
		}
	}),

	dashboard: adminProcedure.query(async ({ ctx }) => {
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
				getAnalyticsForHome(ctx, "daily"),
				getAnalyticsForHome(ctx, "weekly"),
				getAnalyticsForHome(ctx, "monthly"),
				getMostSoldProducts(ctx, "daily"),
				getMostSoldProducts(ctx, "weekly"),
				getMostSoldProducts(ctx, "monthly"),
				getOrderCount(ctx, "daily"),
				getOrderCount(ctx, "weekly"),
				getOrderCount(ctx, "monthly"),
				getPendingOrders(ctx),
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
			// Return a default structure on error to prevent breaking the page
			const errorData = {
				salesData: {
					daily: { sum: 0, salesCount: 0, profit: 0 },
					weekly: { sum: 0, salesCount: 0, profit: 0 },
					monthly: { sum: 0, salesCount: 0, profit: 0 },
				},
				mostSoldProducts: { daily: [], weekly: [], monthly: [] },
				orderCounts: {
					daily: { count: 0 },
					weekly: { count: 0 },
					monthly: { count: 0 },
				},
				pendingOrders: [],
				lastFetched: new Date().toISOString(),
				error: "Failed to fetch data",
			};
			return errorData;
		}
	}),
});
