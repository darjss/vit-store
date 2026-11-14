import type { timeRangeType } from "@vit/shared/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable, SalesTable } from "~/db/schema";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";
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

		// What the shelf is worth now. Cost uses each product's most recent sale cost,
		// because products have no cost column; `costed` says how many in-stock products had one.
		async getInventoryValue() {
			const result = await db().execute<{
				cost: number;
				costed: number;
				retail: number;
				skus: number;
				units: number;
			}>(sql`
				select
					count(*)::int as skus,
					coalesce(sum(${ProductsTable.stock}), 0)::int as units,
					coalesce(sum(${ProductsTable.price} * ${ProductsTable.stock}), 0)::float8 as retail,
					coalesce(sum(last_sale.cost * ${ProductsTable.stock}), 0)::float8 as cost,
					count(last_sale.cost)::int as costed
				from ${ProductsTable}
				left join lateral (
					select ${SalesTable.productCost} as cost from ${SalesTable}
					where ${SalesTable.productId} = ${ProductsTable.id} and ${SalesTable.deletedAt} is null
					order by ${SalesTable.createdAt} desc limit 1
				) last_sale on true
				where ${ProductsTable.deletedAt} is null and ${ProductsTable.stock} > 0
			`);
			return result[0] ?? { cost: 0, costed: 0, retail: 0, skus: 0, units: 0 };
		},

		// Last week's same weekday, from Ulaanbaatar midnight up to this time of day,
		// so a morning check isn't compared against a whole finished day.
		async getSameTimeLastWeek() {
			const result = await db()
				.select({
					orders: sql<number>`count(distinct ${SalesTable.orderId})::int`,
					revenue: sql<number>`coalesce(sum(${SalesTable.sellingPrice} * ${SalesTable.quantitySold}), 0)::int`,
				})
				.from(SalesTable)
				.where(
					and(
						isNull(SalesTable.deletedAt),
						sql`${SalesTable.createdAt} >= (date_trunc('day', (now() - interval '7 days') at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar') at time zone 'UTC'`,
						sql`${SalesTable.createdAt} < (now() - interval '7 days') at time zone 'UTC'`,
					),
				);
			return result[0] ?? { orders: 0, revenue: 0 };
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
				logger.error("getAnalyticsForHome", parseCaught(error));
				return { profit: 0, revenue: 0, salesCount: 0 };
			}
		},

		// One row per Ulaanbaatar day for the home trend. created_at is stored as UTC.
		async getDailySeries(days: number) {
			const day = sql<string>`to_char(((${SalesTable.createdAt} at time zone 'UTC') at time zone 'Asia/Ulaanbaatar')::date, 'YYYY-MM-DD')`;
			return db()
				.select({
					day,
					orders: sql<number>`count(distinct ${SalesTable.orderId})::int`,
					profit: sql<number>`sum((${SalesTable.sellingPrice} - ${SalesTable.productCost}) * ${SalesTable.quantitySold})::int`,
					revenue: sql<number>`sum(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})::int`,
				})
				.from(SalesTable)
				.where(
					and(
						gte(SalesTable.createdAt, sql`now() - make_interval(days => ${days})`),
						isNull(SalesTable.deletedAt),
					),
				)
				.groupBy(day)
				.orderBy(day);
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
				logger.error("getMostSoldProducts", parseCaught(error));
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
				logger.error("getRevenue", parseCaught(error));
				return 0;
			}
		},
	},
};
