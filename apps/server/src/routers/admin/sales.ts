import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { ProductImagesTable, ProductsTable, SalesTable } from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";
import { getDaysFromTimeRange } from "@/lib/utils";
import { timeRangeSchema } from "@/lib/zod/schema";
import {
	getAnalyticsForHome,
	getAverageOrderValue,
	getMostSoldProducts,
	getOrderCount,
	getOrderCountForWeek,
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
			} catch (error) {
				console.error("Error getting analytics for home:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch analytics",
					cause: error,
				});
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
			} catch (error) {
				console.error("Error getting most sold products:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top products",
					cause: error,
				});
			}
		}),

	weeklyOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			return await getOrderCountForWeek(ctx);
		} catch (error) {
			console.error("Error getting order count for week:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch weekly orders",
				cause: error,
			});
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
			} catch (error) {
				console.error("Error getting average order value:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch average order value",
					cause: error,
				});
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
			} catch (error) {
				console.error("Error getting order count:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order count",
					cause: error,
				});
			}
		}),

	pendingOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			return await getPendingOrders(ctx);
		} catch (error) {
			console.error("Error getting pending orders:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch pending orders",
				cause: error,
			});
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
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch dashboard data",
				cause: error,
			});
		}
	}),
});
