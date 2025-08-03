import { and, between, desc, eq, gte, lt, sql } from "drizzle-orm";
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
		const result = await (tx ?? ctx.db)
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
				sum: sql<number>`SUM(${SalesTable.sellingPrice} * ${SalesTable.quantitySold})`,
				cost: sql<number>`SUM(${SalesTable.productCost} * ${SalesTable.quantitySold})`,
				salesCount: sql<number>`COUNT(*)`,
			})
			.from(SalesTable)
			.where(gte(SalesTable.createdAt, getDaysFromTimeRange(timeRange)))
			.get();

		const sum = result?.sum ?? 0;
		const cost = result?.cost ?? 0;
		const profit = sum - cost;
		const salesCount = result?.salesCount ?? 0;

		console.log(
			"salesCount",
			salesCount,
			"sum",
			sum,
			"cost",
			cost,
			"profit",
			profit,
		);
		return { sum, salesCount, profit };
	} catch (e) {
		console.log(e);
		return { sum: 0, salesCount: 0, profit: 0 };
	}
};

export const getMostSoldProducts = async (
	ctx: Context,
	timeRange: "daily" | "weekly" | "monthly" = "daily",
	productCount = 5,
) => {
	const result = await ctx.db
		.select({
			productId: SalesTable.productId,
			totalSold: sql<number>`SUM(${SalesTable.quantitySold})`,
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
			),
		)
		.groupBy(SalesTable.productId)
		.orderBy(sql`SUM(${SalesTable.quantitySold}) DESC`)
		.limit(productCount);
	return result;
};

export const getOrderCountForWeek = async (ctx: Context) => {
	try {
		const orderPromises = [];
		const salesPromises = [];
		for (let i = 0; i < 7; i++) {
			const { startDate, endDate } = getStartAndEndofDayAgo(i);
			const dayOrderPromise = ctx.db
				.select({
					orderCount: sql<number>`COUNT(*)`,
				})
				.from(OrdersTable)
				.where(between(OrdersTable.createdAt, startDate, endDate))
				.get();
			orderPromises.push(dayOrderPromise);
			const daySalesPromise = ctx.db
				.select({
					salesCount: sql<number>`COUNT(*)`,
				})
				.from(SalesTable)
				.where(between(SalesTable.createdAt, startDate, endDate))
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
				date: date.getMonth() + 1 + "/" + date.getDate(),
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
		where: gte(OrdersTable.createdAt, getDaysFromTimeRange(timerange)),
	});

	const total = order.reduce((acc, order) => {
		return acc + order.total;
	}, 0);

	return total / order.length;
};

export const getOrderCount = async (
	ctx: Context,
	timeRange: "daily" | "weekly" | "monthly",
) => {
	try {
		const result = await ctx.db
			.select({
				count: sql<number>`COUNT(*)`,
			})
			.from(OrdersTable)
			.where(gte(OrdersTable.createdAt, getDaysFromTimeRange(timeRange)))
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
			where: eq(OrdersTable.status, "pending"),
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
									where: eq(ProductImagesTable.isPrimary, true),
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
	ctx: Context,
) => {
	const [user] = await ctx.db
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
		});
	if (user === null || user === undefined) {
		throw new Error("User not found");
	}
	return user;
};

export const getUserFromGoogleId = async (googleId: string, ctx: Context) => {
	const result = await ctx.db
		.select({ user: UsersTable })
		.from(UsersTable)
		.where(eq(UsersTable.googleId, googleId));
	if (result.length < 1 || result[0] === undefined) {
		return null;
	}
	return result[0].user as UserSelectType;
};
