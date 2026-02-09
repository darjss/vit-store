import type { timeRangeType } from "@vit/shared/schema";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
	BrandsTable,
	CategoriesTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	SalesTable,
} from "../db/schema";
import { getDaysFromTimeRange } from "../lib/utils";

export const analyticsQueries = {
	admin: {
		async getAverageOrderValue(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			const orders = await db()
				.select({
					avg: sql<number>`AVG(${OrdersTable.total})`,
				})
				.from(OrdersTable)
				.where(gte(OrdersTable.createdAt, startDate));
			return orders[0]?.avg || 0;
		},

		async getTotalProfit(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			const sales = await db()
				.select({
					totalRevenue: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
					totalCost: sql<number>`SUM(${SalesTable.productCost} * ${SalesTable.quantitySold})`,
					totalDiscount: sql<number>`SUM(${SalesTable.discountApplied})`,
				})
				.from(SalesTable)
				.where(gte(SalesTable.createdAt, startDate));
			const revenue = sales[0]?.totalRevenue || 0;
			const cost = sales[0]?.totalCost || 0;
			const discount = sales[0]?.totalDiscount || 0;
			return revenue - cost - discount;
		},

		async getSalesByCategory(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			return await db()
				.select({
					categoryName: CategoriesTable.name,
					brandName: BrandsTable.name,
					total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
					quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
				})
				.from(SalesTable)
				.innerJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
				.innerJoin(
					CategoriesTable,
					eq(ProductsTable.categoryId, CategoriesTable.id),
				)
				.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
				.where(gte(SalesTable.createdAt, startDate))
				.groupBy(CategoriesTable.name, BrandsTable.name);
		},

		async getCustomerLifetimeValue() {
			const result = await db()
				.select({
					averageLifetimeValue: sql<number>`ROUND(AVG(total_spent), 2)`.as(
						"average_lifetime_value",
					),
					totalCustomers:
						sql<number>`COUNT(DISTINCT ${OrdersTable.customerPhone})`.as(
							"total_customers",
						),
					maxLifetimeValue: sql<number>`MAX(total_spent)`.as(
						"max_lifetime_value",
					),
					minLifetimeValue: sql<number>`MIN(total_spent)`.as(
						"min_lifetime_value",
					),
				})
				.from(
					db()
						.select({
							customerPhone: OrdersTable.customerPhone,
							total_spent: sql<number>`SUM(${OrdersTable.total})`.as(
								"total_spent",
							),
						})
						.from(OrdersTable)
						.groupBy(OrdersTable.customerPhone)
						.as("customer_totals"),
				);
			if (result[0] === undefined) {
				return {
					averageLifetimeValue: 0,
					totalCustomers: 0,
					maxLifetimeValue: 0,
					minLifetimeValue: 0,
				};
			}
			return {
				averageLifetimeValue: result[0].averageLifetimeValue,
				totalCustomers: result[0].totalCustomers,
				maxLifetimeValue: result[0].maxLifetimeValue,
				minLifetimeValue: result[0].minLifetimeValue,
			};
		},

		async getRepeatCustomersCount(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			const repeatCustomers = await db()
				.select({
					count: sql<number>`COUNT(DISTINCT customer_phone)`,
				})
				.from(
					db()
						.select({
							customerPhone: OrdersTable.customerPhone,
							orderCount: sql<number>`COUNT(*)`.as("order_count"),
						})
						.from(OrdersTable)
						.where(gte(OrdersTable.createdAt, startDate))
						.groupBy(OrdersTable.customerPhone)
						.having(sql`COUNT(*) > 1`)
						.as("customer_orders"),
				);
			return repeatCustomers[0]?.count || 0;
		},

		async getInventoryStatus() {
			return await db()
				.select({
					productId: ProductsTable.id,
					name: ProductsTable.name,
					stock: ProductsTable.stock,
					status: sql<string>`CASE
				WHEN ${ProductsTable.stock} = 0 THEN 'Out of Stock'
				WHEN ${ProductsTable.stock} < 10 THEN 'Low Stock'
				ELSE 'In Stock'
			END`,
				})
				.from(ProductsTable);
		},

		async getFailedPayments(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			const result = await db()
				.select({
					count: sql<number>`COUNT(*)`,
					total: sql<number>`SUM(${OrdersTable.total})`,
				})
				.from(PaymentsTable)
				.innerJoin(OrdersTable, eq(PaymentsTable.orderId, OrdersTable.id))
				.where(
					and(
						gte(PaymentsTable.createdAt, startDate),
						eq(PaymentsTable.status, "failed"),
					),
				);
			return {
				count: result[0]?.count || 0,
				total: result[0]?.total || 0,
			};
		},

		async getLowInventoryProducts() {
			try {
				const result = await db()
					.select({
						productId: ProductsTable.id,
						name: ProductsTable.name,
						stock: ProductsTable.stock,
						price: ProductsTable.price,
						imageUrl: ProductImagesTable.url,
						status: sql<string>`CASE
				WHEN ${ProductsTable.stock} = 0 THEN 'Out of Stock'
				WHEN ${ProductsTable.stock} < 10 THEN 'Low Stock'
				ELSE 'In Stock'
			END`,
					})
					.from(ProductsTable)
					.leftJoin(
						ProductImagesTable,
						and(
							eq(ProductsTable.id, ProductImagesTable.productId),
							eq(ProductImagesTable.isPrimary, true),
						),
					)
					.where(or(eq(ProductsTable.stock, 0), lt(ProductsTable.stock, 10)))
					.orderBy(ProductsTable.stock);
				return result;
			} catch (error) {
				console.log(error);
				console.error("Error in getLowInventoryProducts:", error);
				throw error;
			}
		},

		async getTopBrandsBySales(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			return await db()
				.select({
					brandName: BrandsTable.name,
					total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
					quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
				})
				.from(SalesTable)
				.innerJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
				.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
				.where(gte(SalesTable.createdAt, startDate))
				.groupBy(BrandsTable.name)
				.orderBy(
					desc(
						sql`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
					),
				)
				.limit(5);
		},

		async getCurrentProductsValue() {
			const result = await db()
				.select({
					total: sql<number>`SUM(${ProductsTable.price} * ${ProductsTable.stock})`,
				})
				.from(ProductsTable);
			return result[0]?.total || 0;
		},

		async getAnalyticsData(timeRange: timeRangeType) {
			const startDate = getDaysFromTimeRange(timeRange);
			const [
				averageOrderValue,
				totalProfit,
				salesByCategory,
				customerLifetimeValue,
				repeatCustomers,
				inventoryStatus,
				failedPayments,
				lowInventoryProducts,
				topBrands,
				currentProductsValue,
			] = await Promise.all([
				// Average Order Value
				db()
					.select({
						avg: sql<number>`AVG(${OrdersTable.total})`,
					})
					.from(OrdersTable)
					.where(gte(OrdersTable.createdAt, startDate))
					.then((orders) => orders[0]?.avg || 0)
					.catch(() => 0),

				// Total Profit
				db()
					.select({
						totalRevenue: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
						totalCost: sql<number>`SUM(${SalesTable.productCost} * ${SalesTable.quantitySold})`,
						totalDiscount: sql<number>`SUM(${SalesTable.discountApplied})`,
					})
					.from(SalesTable)
					.where(gte(SalesTable.createdAt, startDate))
					.then((sales) => {
						const revenue = sales[0]?.totalRevenue || 0;
						const cost = sales[0]?.totalCost || 0;
						const discount = sales[0]?.totalDiscount || 0;
						return revenue - cost - discount;
					})
					.catch(() => 0),

				// Sales by Category
				db()
					.select({
						categoryName: CategoriesTable.name,
						brandName: BrandsTable.name,
						total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
						quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
					})
					.from(SalesTable)
					.innerJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
					.innerJoin(
						CategoriesTable,
						eq(ProductsTable.categoryId, CategoriesTable.id),
					)
					.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
					.where(gte(SalesTable.createdAt, startDate))
					.groupBy(CategoriesTable.name, BrandsTable.name)
					.catch(() => []),

				// Customer Lifetime Value
				db()
					.select({
						averageLifetimeValue: sql<number>`ROUND(AVG(total_spent), 2)`.as(
							"average_lifetime_value",
						),
						totalCustomers:
							sql<number>`COUNT(DISTINCT ${OrdersTable.customerPhone})`.as(
								"total_customers",
							),
						maxLifetimeValue: sql<number>`MAX(total_spent)`.as(
							"max_lifetime_value",
						),
						minLifetimeValue: sql<number>`MIN(total_spent)`.as(
							"min_lifetime_value",
						),
					})
					.from(
						db()
							.select({
								customerPhone: OrdersTable.customerPhone,
								total_spent: sql<number>`SUM(${OrdersTable.total})`.as(
									"total_spent",
								),
							})
							.from(OrdersTable)
							.groupBy(OrdersTable.customerPhone)
							.as("customer_totals"),
					)
					.then((result) => {
						if (result[0] === undefined) {
							return {
								averageLifetimeValue: 0,
								totalCustomers: 0,
								maxLifetimeValue: 0,
								minLifetimeValue: 0,
							};
						}
						return {
							averageLifetimeValue: result[0].averageLifetimeValue,
							totalCustomers: result[0].totalCustomers,
							maxLifetimeValue: result[0].maxLifetimeValue,
							minLifetimeValue: result[0].minLifetimeValue,
						};
					})
					.catch(() => ({
						averageLifetimeValue: 0,
						totalCustomers: 0,
						maxLifetimeValue: 0,
						minLifetimeValue: 0,
					})),

				// Repeat Customers Count
				db()
					.select({
						count: sql<number>`COUNT(DISTINCT customer_phone)`,
					})
					.from(
						db()
							.select({
								customerPhone: OrdersTable.customerPhone,
								orderCount: sql<number>`COUNT(*)`.as("order_count"),
							})
							.from(OrdersTable)
							.where(gte(OrdersTable.createdAt, startDate))
							.groupBy(OrdersTable.customerPhone)
							.having(sql`COUNT(*) > 1`)
							.as("customer_orders"),
					)
					.then((repeatCustomers) => repeatCustomers[0]?.count || 0)
					.catch(() => 0),

				// Inventory Status
				db()
					.select({
						productId: ProductsTable.id,
						name: ProductsTable.name,
						stock: ProductsTable.stock,
						status: sql<string>`CASE
					WHEN ${ProductsTable.stock} = 0 THEN 'Out of Stock'
					WHEN ${ProductsTable.stock} < 10 THEN 'Low Stock'
					ELSE 'In Stock'
				END`,
					})
					.from(ProductsTable)
					.catch(() => []),

				// Failed Payments
				db()
					.select({
						count: sql<number>`COUNT(*)`,
						total: sql<number>`SUM(${OrdersTable.total})`,
					})
					.from(PaymentsTable)
					.innerJoin(OrdersTable, eq(PaymentsTable.orderId, OrdersTable.id))
					.where(
						and(
							gte(PaymentsTable.createdAt, startDate),
							eq(PaymentsTable.status, "failed"),
						),
					)
					.then((result) => ({
						count: result[0]?.count || 0,
						total: result[0]?.total || 0,
					}))
					.catch(() => ({ count: 0, total: 0 })),

				// Low Inventory Products
				db()
					.select({
						productId: ProductsTable.id,
						name: ProductsTable.name,
						stock: ProductsTable.stock,
						price: ProductsTable.price,
						imageUrl: ProductImagesTable.url,
						status: sql<string>`CASE
					WHEN ${ProductsTable.stock} = 0 THEN 'Out of Stock'
					WHEN ${ProductsTable.stock} < 10 THEN 'Low Stock'
					ELSE 'In Stock'
				END`,
					})
					.from(ProductsTable)
					.leftJoin(
						ProductImagesTable,
						and(
							eq(ProductsTable.id, ProductImagesTable.productId),
							eq(ProductImagesTable.isPrimary, true),
						),
					)
					.where(or(eq(ProductsTable.stock, 0), lt(ProductsTable.stock, 10)))
					.orderBy(ProductsTable.stock)
					.catch(() => []),

				// Top Brands by Sales
				db()
					.select({
						brandName: BrandsTable.name,
						total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
						quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
					})
					.from(SalesTable)
					.innerJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
					.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
					.where(gte(SalesTable.createdAt, startDate))
					.groupBy(BrandsTable.name)
					.orderBy(
						desc(
							sql`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
						),
					)
					.limit(5)
					.then((result) => result)
					.catch(
						() =>
							[] as Array<{
								brandName: string;
								total: number;
								quantity: number;
							}>,
					),

				// Current Products Value
				db()
					.select({
						total: sql<number>`SUM(${ProductsTable.price} * ${ProductsTable.stock})`,
					})
					.from(ProductsTable)
					.then((result) => result[0]?.total || 0)
					.catch(() => 0),
			]);

			return {
				// Key metrics
				averageOrderValue,
				totalProfit,

				// Sales data
				salesByCategory,
				topBrands,

				// Customer metrics
				customerLifetimeValue,
				repeatCustomers,

				// Inventory data
				inventoryStatus,
				lowInventoryProducts,

				// Payment data
				failedPayments,

				// Metadata
				lastUpdated: new Date().toISOString(),
				timeRange,

				// Add any computed metrics
				metrics: {
					totalProducts: inventoryStatus.length,
					lowStockCount: lowInventoryProducts.length,
					topBrandRevenue: topBrands.reduce(
						(acc, brand) => acc + brand.total,
						0,
					),
					currentProductsValue,
				},
			};
		},
	},
};
