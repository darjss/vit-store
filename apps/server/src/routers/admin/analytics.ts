import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
	BrandsTable,
	CategoriesTable,
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	PurchasesTable,
	SalesTable,
} from "@/db/schema";
import { adminProcedure, router } from "@/lib/trpc";
import { getDaysFromTimeRange } from "@/lib/utils";
import { timeRangeSchema } from "@/lib/zod/schema";
import { getOrderCount, getPendingOrders, getRevenue } from "./utils";

export const analytics = router({
	getAverageOrderValue: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				const orders = await ctx.db
					.select({
						avg: sql<number>`AVG(${OrdersTable.total})`,
					})
					.from(OrdersTable)
					.where(gte(OrdersTable.createdAt, startDate));

				return orders[0]?.avg || 0;
			} catch (error) {
				console.error("Error in getAverageOrderValue:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch average order value",
					cause: error,
				});
			}
		}),

	getTotalProfit: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				const sales = await ctx.db
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
			} catch (error) {
				console.error("Error in getTotalProfit:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch total profit",
					cause: error,
				});
			}
		}),

	getSalesByCategory: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				return await ctx.db
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
			} catch (error) {
				console.error("Error in getSalesByCategory:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch sales by category",
					cause: error,
				});
			}
		}),

	getCustomerLifetimeValue: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
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
					ctx.db
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
		} catch (error) {
			console.error("Error in getCustomerLifetimeValue:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch customer lifetime value",
				cause: error,
			});
		}
	}),

	getRepeatCustomersCount: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				// More efficient query using window functions
				const repeatCustomers = await ctx.db
					.select({
						count: sql<number>`COUNT(DISTINCT customer_phone)`,
					})
					.from(
						ctx.db
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
			} catch (error) {
				console.error("Error in getRepeatCustomersCount:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch repeat customers count",
					cause: error,
				});
			}
		}),

	getInventoryStatus: adminProcedure.query(async ({ ctx }) => {
		try {
			return await ctx.db
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
		} catch (error) {
			console.error("Error in getInventoryStatus:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch inventory status",
				cause: error,
			});
		}
	}),

	getFailedPayments: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				const result = await ctx.db
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
			} catch (error) {
				console.error("Error in getFailedPayments:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch failed payments",
					cause: error,
				});
			}
		}),

	getLowInventoryProducts: adminProcedure.query(async ({ ctx }) => {
		try {
			return await ctx.db
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
		} catch (error) {
			console.error("Error in getLowInventoryProducts:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch low inventory products",
				cause: error,
			});
		}
	}),

	getTopBrandsBySales: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = getDaysFromTimeRange(timeRange);

				return await ctx.db
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
			} catch (error) {
				console.error("Error in getTopBrandsBySales:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch top brands by sales",
					cause: error,
				});
			}
		}),

	getCurrentProductsValue: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({
					total: sql<number>`SUM(${ProductsTable.price} * ${ProductsTable.stock})`,
				})
				.from(ProductsTable);
			return result[0]?.total || 0;
		} catch (error) {
			console.error("Error in getCurrentProductsValue:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch current products value",
				cause: error,
			});
		}
	}),

	getAnalyticsData: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
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
					ctx.db
						.select({
							avg: sql<number>`AVG(${OrdersTable.total})`,
						})
						.from(OrdersTable)
						.where(gte(OrdersTable.createdAt, startDate))
						.then((orders) => orders[0]?.avg || 0)
						.catch(() => 0),

					// Total Profit
					ctx.db
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
					ctx.db
						.select({
							categoryName: CategoriesTable.name,
							brandName: BrandsTable.name,
							total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
							quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
						})
						.from(SalesTable)
						.innerJoin(
							ProductsTable,
							eq(SalesTable.productId, ProductsTable.id),
						)
						.innerJoin(
							CategoriesTable,
							eq(ProductsTable.categoryId, CategoriesTable.id),
						)
						.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
						.where(gte(SalesTable.createdAt, startDate))
						.groupBy(CategoriesTable.name, BrandsTable.name)
						.catch(() => []),

					// Customer Lifetime Value
					ctx.db
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
							ctx.db
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
					ctx.db
						.select({
							count: sql<number>`COUNT(DISTINCT customer_phone)`,
						})
						.from(
							ctx.db
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
					ctx.db
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
					ctx.db
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
					ctx.db
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
					ctx.db
						.select({
							brandName: BrandsTable.name,
							total: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
							quantity: sql<number>`SUM(${SalesTable.quantitySold})`,
						})
						.from(SalesTable)
						.innerJoin(
							ProductsTable,
							eq(SalesTable.productId, ProductsTable.id),
						)
						.innerJoin(BrandsTable, eq(ProductsTable.brandId, BrandsTable.id))
						.where(gte(SalesTable.createdAt, startDate))
						.groupBy(BrandsTable.name)
						.orderBy(
							desc(
								sql`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
							),
						)
						.limit(5)
						.catch(() => []),

					// Current Products Value
					ctx.db
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
			} catch (error) {
				console.error("Error in getAnalyticsData:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch analytics data",
					cause: error,
				});
			}
		}),
  getHomePageData: adminProcedure.input(
    z.object({
      timeRange:timeRangeSchema
    })

  ).query(async ({ ctx, input }) => {
			try {
			  const timeRange=input.timeRange
				const pendingOrders = await getPendingOrders(ctx);
				const revenue=await getRevenue(timeRange, ctx)
				const orderCount= await getOrderCount(timeRange,ctx)
				
				
			} catch (e) {
				console.error(e);
			}
		})
});
