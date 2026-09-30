import type { timeRangeType } from "@vit/shared/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable, SalesTable } from "~/db/schema";
import { logger } from "~/lib/logger";
import type { AddSalesType, TransactionType } from "~/lib/types";
import { getDaysFromTimeRange } from "~/lib/utils";

export const salesQueries = {
	admin: {
		async addSale(sale: AddSalesType) {
			const result = await db().insert(SalesTable).values(sale);
			return result;
		},

		async addSaleTx(tx: TransactionType, sale: AddSalesType) {
			const result = await tx.insert(SalesTable).values(sale);
			return result;
		},

		async getAnalyticsForHome(timeRange: "daily" | "weekly" | "monthly" = "daily") {
			try {
				const result = await db()
					.select({
						cost: sql<number>`SUM(${SalesTable.productCost} * ${SalesTable.quantitySold})`,
						revenue: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
						salesCount: sql<number>`COUNT(*)`,
					})
					.from(SalesTable)
					.where(
						and(
							gte(SalesTable.createdAt, getDaysFromTimeRange(timeRange)),
							isNull(SalesTable.deletedAt),
						),
					)
					.limit(1);

				const revenue = result[0]?.revenue ?? 0;
				const cost = result[0]?.cost ?? 0;
				const profit = revenue - cost;
				const salesCount = result[0]?.salesCount ?? 0;

				return { profit, revenue, salesCount };
			} catch (error) {
				logger.error("getAnalyticsForHome", error);
				return { profit: 0, revenue: 0, salesCount: 0 };
			}
		},

		async getMostSoldProducts(timeRange: timeRangeType, productCount = 5) {
			try {
				const result = await db()
					.select({
						imageUrl: ProductImagesTable.url,
						name: ProductsTable.name,
						productId: SalesTable.productId,
						revenue: sql<number>`SUM(${SalesTable.quantitySold} * ${SalesTable.sellingPrice})`,
						totalSold: sql<number>`SUM(${SalesTable.quantitySold})`,
					})
					.from(SalesTable)
					.leftJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
					.leftJoin(
						ProductImagesTable,
						and(
							eq(SalesTable.productId, ProductImagesTable.productId),
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					)
					.where(
						and(
							gte(SalesTable.createdAt, getDaysFromTimeRange(timeRange)),
							isNull(SalesTable.deletedAt),
						),
					)
					.groupBy(SalesTable.productId, ProductsTable.name, ProductImagesTable.url)
					.orderBy(sql`SUM(${SalesTable.quantitySold}) DESC`)
					.limit(productCount);
				return result;
			} catch (error) {
				logger.error("getMostSoldProducts", error);
				throw error;
			}
		},

		async getRevenue(timeRange: timeRangeType) {
			try {
				const startDate = getDaysFromTimeRange(timeRange);
				const result = await db()
					.select({
						revenue: sql<number>`SUM(${SalesTable.sellingPrice}*${SalesTable.quantitySold})`,
					})
					.from(SalesTable)
					.where(and(gte(SalesTable.createdAt, startDate), isNull(SalesTable.deletedAt)));
				return result[0]?.revenue ?? 0;
			} catch (error) {
				logger.error("getRevenue", error);
				return 0;
			}
		},
	},
};
