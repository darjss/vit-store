import type { timeRangeType } from "@vit/shared/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { ProductImagesTable, ProductsTable, SalesTable } from "../db/schema";
import type { AddSalesType } from "../lib/types";
import { getDaysFromTimeRange } from "../lib/utils";

export function salesQueries(db: DB) {
	return {
		admin: {
			async addSale(sale: AddSalesType) {
				const result = await db.insert(SalesTable).values(sale);
				return result;
			},

			async getAnalyticsForHome(
				timeRange: "daily" | "weekly" | "monthly" = "daily",
			) {
				try {
					const result = await db
						.select({
							revenue: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
							cost: sql<number>`SUM(${SalesTable.productCost} * ${SalesTable.quantitySold})`,
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

					console.log(
						"salesCount",
						salesCount,
						"revenue",
						revenue,
						"cost",
						cost,
						"profit",
						profit,
					);
					return { revenue, salesCount, profit };
				} catch (e) {
					console.error(e);
					return { revenue: 0, salesCount: 0, profit: 0 };
				}
			},

			async getMostSoldProducts(timeRange: timeRangeType, productCount = 5) {
				try {
					const result = await db
						.select({
							productId: SalesTable.productId,
							totalSold: sql<number>`SUM(${SalesTable.quantitySold})`,
							revenue: sql<number>`SUM(${SalesTable.quantitySold} * ${SalesTable.sellingPrice})`,
							name: ProductsTable.name,
							imageUrl: ProductImagesTable.url,
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
						.groupBy(
							SalesTable.productId,
							ProductsTable.name,
							ProductImagesTable.url,
						)
						.orderBy(sql`SUM(${SalesTable.quantitySold}) DESC`)
						.limit(productCount);
					return result;
				} catch (e) {
					console.log(e);
					console.error("Error getting most sold products:", e);
					throw e;
				}
			},

			async getRevenue(timeRange: timeRangeType) {
				try {
					const startDate = getDaysFromTimeRange(timeRange);
					const result = await db
						.select({
							revenue: sql<number>`SUM(${SalesTable.sellingPrice}*${SalesTable.quantitySold})`,
						})
						.from(SalesTable)
						.where(gte(SalesTable.createdAt, startDate));
					return result;
				} catch (e) {
					console.error(e);
					return [];
				}
			},
		},
	};
}
