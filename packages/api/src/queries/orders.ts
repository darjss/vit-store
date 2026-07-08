import type { timeRangeType } from "@vit/shared/schema";
import type { OrderStatusType, PaymentStatusType } from "@vit/shared/types/order";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	between,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	like,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { db } from "~/db/client";
import {
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	SalesTable,
} from "~/db/schema";
import { logger } from "~/lib/logger";
import type { TransactionType } from "~/lib/types";
import {
	type deliveryProvider,
	getDaysFromTimeRange,
	getStartAndEndofDayAgo,
	type orderStatus,
	shapeOrderResult,
	shapeOrderResults,
	UB_OFFSET_MS,
} from "~/lib/utils";

type OrderStatus = (typeof orderStatus)[number];
type DeliveryProvider = (typeof deliveryProvider)[number];

function resolveDateRange(date?: string): { start: Date; end: Date } | null {
	if (date === undefined || date === "all") return null;

	// All ranges are computed in Asia/Ulaanbaatar (UTC+8, no DST) using the
	// shared UB-aware helpers from ~/lib/utils. The previous implementation
	// used runtime-local setHours (UTC on Workers) and a hardcoded "+08:00"
	// string for specific dates, which diverged from the rest of the app.
	if (date === "today") {
		const { startDate, endDate } = getStartAndEndofDayAgo(0);
		return { start: startDate, end: endDate };
	}
	if (date === "yesterday") {
		const { startDate, endDate } = getStartAndEndofDayAgo(1);
		return { start: startDate, end: endDate };
	}
	if (date === "last7days") {
		const start = getStartAndEndofDayAgo(6).startDate;
		const end = getStartAndEndofDayAgo(0).endDate;
		return { start, end };
	}
	if (date === "last30days") {
		const start = getStartAndEndofDayAgo(29).startDate;
		const end = getStartAndEndofDayAgo(0).endDate;
		return { start, end };
	}
	// specific date "YYYY-MM-DD" — interpret as a UB-local calendar date and
	// return the UTC instants for UB midnight start and UB 23:59:59.999 end.
	const [y, m, d] = date.split("-").map(Number);
	const epochUtcMidnight = Date.UTC(y, m - 1, d);
	const ubMidnightUtc = epochUtcMidnight - UB_OFFSET_MS;
	const DAY_MS = 24 * 60 * 60 * 1000;
	return { start: new Date(ubMidnightUtc), end: new Date(ubMidnightUtc + DAY_MS - 1) };
}

export const orderQueries = {
	admin: {
		async getOrderCountForWeek() {
			try {
				// 2 aggregate queries (orders + sales) with GROUP BY UB-day over
				// the last 7 days, replacing the previous 14 parallel per-day
				// queries. Buckets are computed by shifting createdAt into
				// Asia/Ulaanbaatar (UTC+8) before DATE_TRUNC('day', ...).
				const weekStart = getStartAndEndofDayAgo(6).startDate;
				const weekEnd = getStartAndEndofDayAgo(0).endDate;
				const ubDayBucket = sql<Date>`DATE_TRUNC('day', ${OrdersTable.createdAt} + INTERVAL '8 hours')`;
				const ubSalesDayBucket = sql<Date>`DATE_TRUNC('day', ${SalesTable.createdAt} + INTERVAL '8 hours')`;

				const [orderRows, salesRows] = await Promise.all([
					db()
						.select({
							day: ubDayBucket,
							orderCount: sql<number>`COUNT(*)`,
						})
						.from(OrdersTable)
						.where(
							and(
								between(OrdersTable.createdAt, weekStart, weekEnd),
								isNull(OrdersTable.deletedAt),
							),
						)
						.groupBy(ubDayBucket),
					db()
						.select({
							day: ubSalesDayBucket,
							salesCount: sql<number>`COUNT(*)`,
						})
						.from(SalesTable)
						.where(
							and(
								between(SalesTable.createdAt, weekStart, weekEnd),
								isNull(SalesTable.deletedAt),
							),
						)
						.groupBy(ubSalesDayBucket),
				]);

				const ordersByDay = new Map<string, number>();
				for (const row of orderRows) {
					const ubDay = new Date(row.day.getTime() + UB_OFFSET_MS);
					ordersByDay.set(
						`${ubDay.getUTCMonth() + 1}/${ubDay.getUTCDate()}`,
						Number(row.orderCount),
					);
				}
				const salesByDay = new Map<string, number>();
				for (const row of salesRows) {
					const ubDay = new Date(row.day.getTime() + UB_OFFSET_MS);
					salesByDay.set(
						`${ubDay.getUTCMonth() + 1}/${ubDay.getUTCDate()}`,
						Number(row.salesCount),
					);
				}

				// Emit today-first (i=0) through 6-days-ago (i=6), matching the
				// previous ordering.
				const result: Array<{
					orderCount: number;
					salesCount: number;
					date: string;
				}> = [];
				for (let i = 0; i < 7; i++) {
					const { startDate } = getStartAndEndofDayAgo(i);
					const ubDay = new Date(startDate.getTime() + UB_OFFSET_MS);
					const label = `${ubDay.getUTCMonth() + 1}/${ubDay.getUTCDate()}`;
					result.push({
						orderCount: ordersByDay.get(label) ?? 0,
						salesCount: salesByDay.get(label) ?? 0,
						date: label,
					});
				}
				return result;
			} catch {
				return [];
			}
		},

		async getAverageOrderValue(timerange: "daily" | "weekly" | "monthly") {
			const order = await db().query.OrdersTable.findMany({
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

			return order.length > 0 ? total / order.length : 0;
		},

		async getOrderCount(timeRange: timeRangeType) {
			try {
				const result = await db()
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
					.limit(1);

				const count = result[0]?.count ?? 0;

				return { count };
			} catch {
				return { count: 0 };
			}
		},

		async getPendingOrders() {
			try {
				const result = await db().query.OrdersTable.findMany({
					where: and(
						eq(OrdersTable.status, "pending"),
						isNull(OrdersTable.deletedAt),
					),
					orderBy: desc(OrdersTable.createdAt),
					with: {
						orderDetails: {
							columns: {
								quantity: true,
								price: true,
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
								paymentNumber: true,
								createdAt: true,
							},
							where: isNull(PaymentsTable.deletedAt),
						},
					},
				});
				return shapeOrderResults(result);
			} catch {
				return [];
			}
		},

		async createOrder(data: {
			orderNumber: string;
			customerPhone: number;
			status: OrderStatus;
			notes: string | null;
			total: number;
			address: string;
			deliveryProvider: DeliveryProvider;
		}) {
			const result = await db()
				.insert(OrdersTable)
				.values(data)
				.returning({ orderId: OrdersTable.id });
			return result[0];
		},

		async createOrderTx(
			tx: TransactionType,
			data: {
				orderNumber: string;
				customerPhone: number;
				status: OrderStatus;
				notes: string | null;
				total: number;
				address: string;
				deliveryProvider: DeliveryProvider;
			},
		) {
			const result = await tx
				.insert(OrdersTable)
				.values(data)
				.returning({ orderId: OrdersTable.id });
			return result[0];
		},

		async createOrderDetails(
			orderId: number,
			products: Array<{ productId: number; quantity: number; price: number }>,
		) {
			const values = products.map((p) => ({
				orderId,
				productId: p.productId,
				quantity: p.quantity,
				price: p.price,
			}));
			await db().insert(OrderDetailsTable).values(values);
		},

		async createOrderDetailsTx(
			tx: TransactionType,
			orderId: number,
			products: Array<{ productId: number; quantity: number; price: number }>,
		) {
			const values = products.map((p) => ({
				orderId,
				productId: p.productId,
				quantity: p.quantity,
				price: p.price,
			}));
			await tx.insert(OrderDetailsTable).values(values);
		},

		async searchOrder(searchTerm: string) {
			const orders = await db().query.OrdersTable.findMany({
				where: and(
					isNull(OrdersTable.deletedAt),
					or(
						ilike(OrdersTable.orderNumber, `%${searchTerm}%`),
						ilike(OrdersTable.address, `%${searchTerm}%`),
						like(
							sql`CAST(${OrdersTable.customerPhone} AS TEXT)`,
							`%${searchTerm}%`,
						),
					),
				),
				with: {
					orderDetails: {
						columns: {
							quantity: true,
							price: true,
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
							paymentNumber: true,
							createdAt: true,
						},
						where: isNull(PaymentsTable.deletedAt),
					},
				},
			});
			return shapeOrderResults(orders);
		},

		async searchOrdersQuick(searchTerm: string, limit = 5) {
			const term = searchTerm.trim();
			if (!term) return [];

			return db().query.OrdersTable.findMany({
				where: and(
					isNull(OrdersTable.deletedAt),
					or(
						ilike(OrdersTable.orderNumber, `%${term}%`),
						like(sql`CAST(${OrdersTable.customerPhone} AS TEXT)`, `%${term}%`),
					),
				),
				columns: {
					id: true,
					orderNumber: true,
					customerPhone: true,
					status: true,
					total: true,
					createdAt: true,
				},
				orderBy: desc(OrdersTable.createdAt),
				limit,
			});
		},

		async getAllOrders() {
			const result = await db().query.OrdersTable.findMany({
				where: isNull(OrdersTable.deletedAt),
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
				},
			});
			return result.map((order) => ({
				id: order.id,
				orderNumber: order.orderNumber,
				customerPhone: order.customerPhone,
				status: order.status,
				total: order.total,
				notes: order.notes,
				createdAt: order.createdAt,
				updatedAt: order.updatedAt,
				products: order.orderDetails.map((orderDetail) => ({
					quantity: orderDetail.quantity,
					name: orderDetail.product.name,
					id: orderDetail.product.id,
					imageUrl: orderDetail.product.images[0]?.url,
				})),
			}));
		},

		async getOrderById(id: number) {
			const result = await db().query.OrdersTable.findFirst({
				where: and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)),
				with: {
					orderDetails: {
						columns: {
							quantity: true,
							price: true,
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
							paymentNumber: true,
							createdAt: true,
						},
						where: isNull(PaymentsTable.deletedAt),
					},
				},
			});
			return result ? shapeOrderResult(result) : null;
		},

		async getPaginatedOrders(params: {
			page: number;
			pageSize: number;
			paymentStatus?: PaymentStatusType;
			orderStatus?: OrderStatus;
			sortField?: string;
			sortDirection?: "asc" | "desc";
			searchTerm?: string;
			date?: string;
		}) {
			const conditions: (SQL<unknown> | undefined)[] = [];
			conditions.push(isNull(OrdersTable.deletedAt));

			if (params.orderStatus !== undefined) {
				conditions.push(eq(OrdersTable.status, params.orderStatus));
			} else if (params.paymentStatus === undefined) {
				// Default: hide "created" (unpaid) orders from the admin list.
				// When a paymentStatus filter is set, drop the exclusion so admins
				// filtering by pending payments can still see "created" orders
				// (which are exactly the orders with pending payments).
				conditions.push(ne(OrdersTable.status, "created"));
			}

			if (params.paymentStatus !== undefined) {
				// Move the payment-status filter into the SQL WHERE so both the page
				// query and the count query honor it. Previously the count ignored
				// paymentStatus, producing wrong totalPages (mostly empty pages
				// after page 1).
				conditions.push(
					sql`${OrdersTable.id} IN (SELECT ${PaymentsTable.orderId} FROM ${PaymentsTable} WHERE ${PaymentsTable.status} = ${params.paymentStatus} AND ${PaymentsTable.deletedAt} IS NULL)`,
				);
			}

			if (params.searchTerm !== undefined) {
				conditions.push(
					or(
						ilike(OrdersTable.orderNumber, `%${params.searchTerm}%`),
						ilike(OrdersTable.address, `%${params.searchTerm}%`),
						ilike(
							sql`CAST(${OrdersTable.customerPhone} AS TEXT)`,
							`%${params.searchTerm}%`,
						),
					),
				);
			}

			const dateRange = resolveDateRange(params.date);
			if (dateRange) {
				conditions.push(
					between(OrdersTable.createdAt, dateRange.start, dateRange.end),
				);
			}

			const orderByClauses: SQL<unknown>[] = [];
			const primarySortColumn =
				params.sortField === "total"
					? OrdersTable.total
					: OrdersTable.createdAt;

			const primaryOrderBy =
				params.sortDirection === "asc"
					? asc(primarySortColumn)
					: desc(primarySortColumn);

			orderByClauses.push(primaryOrderBy);
			orderByClauses.push(asc(OrdersTable.id));

			const finalConditions = conditions.filter(
				(c): c is SQL<unknown> => c !== undefined,
			);

			const offset = (params.page - 1) * params.pageSize;

			const orderResults = await db().query.OrdersTable.findMany({
				limit: params.pageSize,
				offset: offset,
				orderBy: orderByClauses,
				where: finalConditions.length > 0 ? and(...finalConditions) : undefined,
				with: {
					orderDetails: {
						columns: { quantity: true, price: true },
						with: {
							product: {
								columns: { name: true, id: true, price: true },
								with: {
									images: {
										columns: { url: true },
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
							paymentNumber: true,
							createdAt: true,
						},
						where:
							params.paymentStatus === undefined
								? isNull(PaymentsTable.deletedAt)
								: and(
										isNull(PaymentsTable.deletedAt),
										eq(PaymentsTable.status, params.paymentStatus),
									),
					},
				},
			});

			const ordersWithoutPayment = orderResults
				.filter((order) => order.payments.length === 0)
				.map((order) => order.id);

			if (ordersWithoutPayment.length > 0) {
				logger.warn("admin.orders_missing_payment", {
					count: ordersWithoutPayment.length,
					orderIds: ordersWithoutPayment,
				});
			}

			const totalCountResult = await db()
				.select({ count: sql<number>`COUNT(*)` })
				.from(OrdersTable)
				.where(finalConditions.length > 0 ? and(...finalConditions) : undefined)
				.limit(1);

			const totalCount = totalCountResult[0]?.count ?? 0;
			const totalPages = Math.ceil(totalCount / params.pageSize);

			return {
				orders: shapeOrderResults(orderResults),
				pagination: {
					currentPage: params.page,
					totalPages,
					totalCount,
					hasNextPage: params.page < totalPages,
					hasPreviousPage: params.page > 1,
				},
			};
		},

		async updateOrderStatus(
			id: number,
			status: OrderStatus,
			options?: { deliveryProvider?: DeliveryProvider },
		) {
			const patch: { status: OrderStatus; deliveryProvider?: DeliveryProvider } = {
				status,
			};
			if (options?.deliveryProvider !== undefined) {
				patch.deliveryProvider = options.deliveryProvider;
			}
			await db()
				.update(OrdersTable)
				.set(patch)
				.where(and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)));
		},

		async updateOrderTx(
			tx: TransactionType,
			id: number,
			data: {
				customerPhone?: number;
				status?: OrderStatusType;
				notes?: string | null;
				total?: number;
				address?: string;
				addressZoneId?: number | null;
				deliveryProvider?: DeliveryProvider;
			},
		) {
			await tx.update(OrdersTable).set(data).where(eq(OrdersTable.id, id));
		},

		async patchOrderHeader(
			id: number,
			data: {
				customerPhone?: number;
				status?: OrderStatusType;
				notes?: string | null;
				address?: string;
				addressZoneId?: number | null;
				deliveryProvider?: DeliveryProvider;
			},
		) {
			await db()
				.update(OrdersTable)
				.set(data)
				.where(and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)));
		},

		async getOrderDetailsByOrderIdTx(tx: TransactionType, orderId: number) {
			return tx
				.select()
				.from(OrderDetailsTable)
				.where(eq(OrderDetailsTable.orderId, orderId));
		},

		async deleteOrderDetailsTx(tx: TransactionType, orderId: number) {
			await tx
				.delete(OrderDetailsTable)
				.where(eq(OrderDetailsTable.orderId, orderId));
		},

		async softDeleteOrderTx(tx: TransactionType, id: number) {
			const now = new Date();
			await tx
				.update(OrderDetailsTable)
				.set({ deletedAt: now })
				.where(eq(OrderDetailsTable.orderId, id));

			await tx
				.update(SalesTable)
				.set({ deletedAt: now })
				.where(eq(SalesTable.orderId, id));

			await tx
				.update(PaymentsTable)
				.set({ deletedAt: now })
				.where(eq(PaymentsTable.orderId, id));

			await tx
				.update(OrdersTable)
				.set({ deletedAt: now })
				.where(eq(OrdersTable.id, id));
		},

		async restoreOrderTx(tx: TransactionType, id: number) {
			await tx
				.update(OrderDetailsTable)
				.set({ deletedAt: null })
				.where(eq(OrderDetailsTable.orderId, id));

			await tx
				.update(SalesTable)
				.set({ deletedAt: null })
				.where(eq(SalesTable.orderId, id));

			await tx
				.update(PaymentsTable)
				.set({ deletedAt: null })
				.where(eq(PaymentsTable.orderId, id));

			await tx
				.update(OrdersTable)
				.set({ deletedAt: null })
				.where(eq(OrdersTable.id, id));
		},

		async getRecentOrdersByProductId(productId: number) {
			const orderDetails = await db().query.OrderDetailsTable.findMany({
				where: eq(OrderDetailsTable.productId, productId),
				with: {
					order: {
						columns: {
							customerPhone: true,
							status: true,
							orderNumber: true,
							total: true,
							createdAt: true,
							id: true,
						},
					},
				},
				limit: 5,
				orderBy: [asc(OrdersTable.createdAt)],
			});

			return orderDetails.map((detail) => detail.order);
		},
	},

	store: {
		async getOrdersByCustomerPhone(phone: number) {
			const orders = await db().query.OrdersTable.findMany({
				where: and(
					eq(OrdersTable.customerPhone, phone),
					isNull(OrdersTable.deletedAt),
				),
				columns: {
					address: true,
					orderNumber: true,
					status: true,
					total: true,
					notes: true,
					createdAt: true,
				},
				with: {
					sales: {
						columns: {
							sellingPrice: true,
							productId: true,
						},
					},
					orderDetails: {
						columns: {
							productId: true,
							quantity: true,
						},
						with: {
							product: {
								columns: {
									name: true,
								},
								with: {
									brand: {
										columns: {
											name: true,
										},
									},
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
				},
			});
			return orders;
		},

		async getProductsByIds(productIds: number[]) {
			const products = await db().query.ProductsTable.findMany({
				where: inArray(ProductsTable.id, productIds),
				columns: {
					id: true,
					name: true,
					price: true,
				},
			});
			return products;
		},

		async createOrder(data: {
			orderNumber: string;
			customerPhone: number;
			address: string;
			addressZoneId: number;
			notes: string | null;
			total: number;
			status: OrderStatus;
			deliveryProvider: DeliveryProvider;
		}) {
			const result = await db()
				.insert(OrdersTable)
				.values(data)
				.returning({ orderId: OrdersTable.id });
			return result[0];
		},

		async createOrderDetails(
			orderId: number,
			products: Array<{ productId: number; quantity: number }>,
		) {
			const values = products.map((p) => ({
				orderId,
				productId: p.productId,
				quantity: p.quantity,
			}));
			await db().insert(OrderDetailsTable).values(values);
		},

		async getOrderByOrderNumber(orderNumber: string) {
			const order = await db().query.OrdersTable.findFirst({
				where: eq(OrdersTable.orderNumber, orderNumber),
				with: {
					payments: {
						columns: {
							paymentNumber: true,
							status: true,
							provider: true,
							createdAt: true,
						},
					},
					orderDetails: {
						with: {
							product: {
								columns: {
									name: true,
									price: true,
								},
								with: {
									brand: {
										columns: {
											name: true,
										},
									},
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
				},
			});
			return order;
		},
	},
};
