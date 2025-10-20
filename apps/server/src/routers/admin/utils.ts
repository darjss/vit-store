import type { timeRangeType } from "@vit-store/shared/schema";
import { and, between, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	PurchasesTable,
	SalesTable,
	type UserSelectType,
	UsersTable,
} from "@/db/schema";
import type { Context } from "@/lib/context";
import { db } from "@/lib/db";
import type {
	AddSalesType,
	PaymentProviderType,
	PaymentStatusType,
	TransactionType,
} from "@/lib/types";
import {
	getDaysFromTimeRange,
	getStartAndEndofDayAgo,
	shapeOrderResults,
} from "@/lib/utils";

export const addSale = async (
	sale: AddSalesType,
	ctx: Context,
	tx?: TransactionType,
) => {
	try {
		const result = await (tx ?? ctx.db).insert(SalesTable).values(sale);
		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const createPayment = async (
	orderId: number,
	ctx: Context,
	status: PaymentStatusType = "pending",
	provider: PaymentProviderType = "transfer",
	tx?: TransactionType,
) => {
	try {
		const result = await (tx ?? ctx.db)
			.insert(PaymentsTable)
			.values({
				orderId: orderId,
				provider: provider,
				status: status,
			})
			.returning({ id: PaymentsTable.id });
		return result;
	} catch (e) {
		console.error(e);
		throw e;
	}
};

export const updateStock = async (
	productId: number,
	numberToUpdate: number,
	type: "add" | "minus",
	ctx: Context,
	tx?: TransactionType,
) => {
	try {
		const _result = await (tx ?? ctx.db)
			.update(ProductsTable)
			.set({
				stock: sql`${ProductsTable.stock} ${type === "add" ? "+" : "-"} ${numberToUpdate}`,
			})
			.where(eq(ProductsTable.id, productId));
		return { message: "Updated product Successfully" };
	} catch (e) {
		return { message: "Operation failed", error: e };
	}
};

export const getAverageCostOfProduct = async (
	productId: number,
	createdAt: Date,
	ctx: Context,
	tx?: TransactionType,
) => {
	const purchases = await (tx ?? ctx.db)
		.select()
		.from(PurchasesTable)
		.where(
			and(
				eq(PurchasesTable.productId, productId),
				lt(PurchasesTable.createdAt, createdAt),
			),
		);
	const sum = purchases.reduce(
		(acc, purchase) => acc + purchase.unitCost * purchase.quantityPurchased,
		0,
	);
	const totalProduct = purchases.reduce(
		(acc, purchase) => acc + purchase.quantityPurchased,
		0,
	);
	return sum / totalProduct;
};

export const getAnalyticsForHome = async (
	ctx: Context,
	timeRange: "daily" | "weekly" | "monthly" = "daily",
) => {
	try {
		const result = await ctx.db
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
			.get();

		const revenue = result?.revenue ?? 0;
		const cost = result?.cost ?? 0;
		const profit = revenue - cost;
		const salesCount = result?.salesCount ?? 0;

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
		console.log(e);
		return { revenue: 0, salesCount: 0, profit: 0 };
	}
};

export const getMostSoldProducts = async (
	ctx: Context,
	timeRange: timeRangeType,
	productCount = 5,
) => {
	try {
	const result = await ctx.db
		.select({
			productId: SalesTable.productId,
			totalSold: sql<number>`SUM(${SalesTable.quantitySold})`,

			revenue: sql<number>`${SalesTable.quantitySold}*${SalesTable.sellingPrice}`,
			name: ProductsTable.name,
			imageUrl: ProductImagesTable.url,
		})
		.from(SalesTable)
		.leftJoin(ProductsTable, eq(SalesTable.productId, ProductsTable.id))
		.leftJoin(
			ProductImagesTable,
			eq(SalesTable.productId, ProductImagesTable.productId),
		)
		.where(
			and(
				gte(SalesTable.createdAt, getDaysFromTimeRange(timeRange)),
				eq(ProductImagesTable.isPrimary, true),
				isNull(SalesTable.deletedAt),
				isNull(ProductImagesTable.deletedAt),
			),
		)
		.groupBy(SalesTable.productId)
			.orderBy(sql`SUM(${SalesTable.quantitySold}) DESC`)
			.limit(productCount);
		return result;
	} catch (e) {
		console.log(e);
		console.error("Error getting most sold products:", e);
		throw e;
	}
};

export const getOrderCountForWeek = async (ctx: Context) => {
	try {
		const orderPromises: Promise<{ orderCount: number } | undefined>[] = [];
		const salesPromises: Promise<{ salesCount: number } | undefined>[] = [];
		for (let i = 0; i < 7; i++) {
			const { startDate, endDate } = getStartAndEndofDayAgo(i);
			const dayOrderPromise = ctx.db
				.select({
					orderCount: sql<number>`COUNT(*)`,
				})
				.from(OrdersTable)
				.where(
					and(
						between(OrdersTable.createdAt, startDate, endDate),
						isNull(OrdersTable.deletedAt),
					),
				)
				.get();
			orderPromises.push(dayOrderPromise);
			const daySalesPromise = ctx.db
				.select({
					salesCount: sql<number>`COUNT(*)`,
				})
				.from(SalesTable)
				.where(
					and(
						between(SalesTable.createdAt, startDate, endDate),
						isNull(SalesTable.deletedAt),
					),
				)
				.get();
			salesPromises.push(daySalesPromise);
		}
		const orderResults = await Promise.all(orderPromises);
		const salesResults = await Promise.all(salesPromises);
		return orderResults.map((orderResult, i) => {
			const salesResult = salesResults[i];
			const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
			return {
				orderCount: orderResult?.orderCount ?? 0,
				salesCount: salesResult?.salesCount ?? 0,
				date: `${date.getMonth() + 1}/${date.getDate()}`,
			};
		});
	} catch (e) {
		console.error(e);
		return [];
	}
};

export const getAverageOrderValue = async (
	ctx: Context,
	timerange: "daily" | "weekly" | "monthly",
) => {
	const order = await ctx.db.query.OrdersTable.findMany({
		columns: {
			total: true,
			createdAt: true,
		},
		where: and(
			gte(OrdersTable.createdAt, getDaysFromTimeRange(timerange)),
			isNull(OrdersTable.deletedAt),
		),
	});

	const total = order.reduce((acc, order) => {
		return acc + order.total;
	}, 0);

	return total / order.length;
};

export const getOrderCount = async (timeRange: timeRangeType, ctx: Context) => {
	try {
		const result = await ctx.db
			.select({
				count: sql<number>`COUNT(*)`,
			})
			.from(OrdersTable)
			.where(
				and(
					gte(OrdersTable.createdAt, getDaysFromTimeRange(timeRange)),
					isNull(OrdersTable.deletedAt),
				),
			)
			.get();

		const count = result?.count ?? 0;

		return { count };
	} catch (e) {
		console.log(e);
		return { count: 0 };
	}
};

export const getPendingOrders = async (ctx: Context) => {
	try {
		const result = await ctx.db.query.OrdersTable.findMany({
			where: and(
				eq(OrdersTable.status, "pending"),
				isNull(OrdersTable.deletedAt),
			),
			orderBy: desc(OrdersTable.createdAt),
			with: {
				orderDetails: {
					columns: {
						quantity: true,
					},
					with: {
						product: {
							columns: {
								name: true,
								id: true,
								price: true,
							},
							with: {
								images: {
									columns: {
										url: true,
									},
									where: and(
										eq(ProductImagesTable.isPrimary, true),
										isNull(ProductImagesTable.deletedAt),
									),
								},
							},
						},
					},
				},
				payments: {
					columns: {
						provider: true,
						status: true,
						createdAt: true,
					},
					where: isNull(PaymentsTable.deletedAt),
				},
			},
		});
		return shapeOrderResults(result);
	} catch (e) {
		console.log(e);
		return [];
	}
};
export const createUser = async (
	googleId: string,
	username: string,
	isApproved: boolean,
) => {
	const [user] = await db
		.insert(UsersTable)
		.values({
			googleId,
			username,
			isApproved,
		})
		.returning({
			id: UsersTable.id,
			username: UsersTable.username,
			googleId: UsersTable.googleId,
			isApproved: UsersTable.isApproved,
			createdAt: UsersTable.createdAt,
			updatedAt: UsersTable.updatedAt,
			deletedAt: UsersTable.deletedAt,
		});
	if (user === null || user === undefined) {
		throw new Error("User not found");
	}
	return user;
};

export const getUserFromGoogleId = async (googleId: string) => {
	const result = await db
		.select({ user: UsersTable })
		.from(UsersTable)
		.where(
			and(eq(UsersTable.googleId, googleId), isNull(UsersTable.deletedAt)),
		);
	if (result.length < 1 || result[0] === undefined) {
		return null;
	}
	return result[0].user as UserSelectType;
};
export const getRevenue = async (timeRange: timeRangeType, ctx: Context) => {
	try {
		const startDate = getDaysFromTimeRange(timeRange);

		const result = await ctx.db
			.select({
				revenue: sql<number>`SUM(${SalesTable.sellingPrice}*${SalesTable.quantitySold})`,
			})
			.from(SalesTable)
			.where(gte(SalesTable.createdAt, startDate));
		return result;
	} catch (e) {
		console.error(e);
	}
};
