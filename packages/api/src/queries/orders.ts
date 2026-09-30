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
	projectOrderResult,
	projectOrderResults,
	UB_OFFSET_MS,
} from "~/lib/utils";

type OrderStatus = (typeof orderStatus)[number];
type DeliveryProvider = (typeof deliveryProvider)[number];

function resolveDateRange(date?: string): { end: Date; start: Date } | null {
	if (date === undefined || date === "all") {
		return null;
	}

	// All ranges are computed in Asia/Ulaanbaatar (UTC+8, no DST) using the
	// shared UB-aware helpers from ~/lib/utils. The previous implementation
	// used runtime-local setHours (UTC on Workers) and a hardcoded "+08:00"
	// string for specific dates, which diverged from the rest of the app.
	if (date === "today") {
		const { endDate, startDate } = getStartAndEndofDayAgo(0);
		return { end: endDate, start: startDate };
	}
	if (date === "yesterday") {
		const { endDate, startDate } = getStartAndEndofDayAgo(1);
		return { end: endDate, start: startDate };
	}
	if (date === "last7days") {
		const start = getStartAndEndofDayAgo(6).startDate;
		const end = getStartAndEndofDayAgo(0).endDate;
		return { end, start };
	}
	if (date === "last30days") {
		const start = getStartAndEndofDayAgo(29).startDate;
		const end = getStartAndEndofDayAgo(0).endDate;
		return { end, start };
	}
	// specific date "YYYY-MM-DD" — interpret as a UB-local calendar date and
	// return the UTC instants for UB midnight start and UB 23:59:59.999 end.
	const [y, m, d] = date.split("-").map(Number);
	const epochUtcMidnight = Date.UTC(y, m - 1, d);
	const ubMidnightUtc = epochUtcMidnight - UB_OFFSET_MS;
	const DAY_MS = 24 * 60 * 60 * 1000;
	return { end: new Date(ubMidnightUtc + DAY_MS - 1), start: new Date(ubMidnightUtc) };
}

function buildPaginatedOrderConditions(
	database: ReturnType<typeof db>,
	params: {
		createdAfter?: Date;
		date?: string;
		includeAllStatuses?: boolean;
		orderStatus?: OrderStatus;
		orderStatuses?: Array<OrderStatus>;
		paymentStatus?: PaymentStatusType;
		searchTerm?: string;
	},
) {
	const conditions: Array<SQL<unknown> | undefined> = [isNull(OrdersTable.deletedAt)];

	if (params.orderStatuses && params.orderStatuses.length > 0) {
		conditions.push(inArray(OrdersTable.status, params.orderStatuses));
	} else if (params.orderStatus !== undefined) {
		conditions.push(eq(OrdersTable.status, params.orderStatus));
	} else if (!params.includeAllStatuses && params.paymentStatus === undefined) {
		conditions.push(ne(OrdersTable.status, "created"));
	}

	if (params.paymentStatus !== undefined) {
		const paidOrderIds = database
			.select({ orderId: PaymentsTable.orderId })
			.from(PaymentsTable)
			.where(and(eq(PaymentsTable.status, params.paymentStatus), isNull(PaymentsTable.deletedAt)));
		conditions.push(inArray(OrdersTable.id, paidOrderIds));
	}

	if (params.searchTerm !== undefined) {
		conditions.push(
			or(
				ilike(OrdersTable.orderNumber, `%${params.searchTerm}%`),
				ilike(OrdersTable.address, `%${params.searchTerm}%`),
				ilike(sql`CAST(${OrdersTable.customerPhone} AS TEXT)`, `%${params.searchTerm}%`),
			),
		);
	}

	const dateRange = resolveDateRange(params.date);
	if (dateRange) {
		conditions.push(between(OrdersTable.createdAt, dateRange.start, dateRange.end));
	}

	if (params.createdAfter !== undefined) {
		conditions.push(gte(OrdersTable.createdAt, params.createdAfter));
	}

	return conditions.filter((condition): condition is SQL<unknown> => condition !== undefined);
}

export const orderQueries = {
	admin: {
		async createOrder(data: {
			address: string;
			customerPhone: number;
			deliveryProvider: DeliveryProvider;
			notes: string | null;
			orderNumber: string;
			status: OrderStatus;
			total: number;
		}) {
			const result = await db()
				.insert(OrdersTable)
				.values(data)
				.returning({ orderId: OrdersTable.id });
			return result[0];
		},

		async createOrderDetails(
			orderId: number,
			products: Array<{ price: number; productId: number; quantity: number }>,
		) {
			const values = products.map((p) => ({
				orderId,
				price: p.price,
				productId: p.productId,
				quantity: p.quantity,
			}));
			await db().insert(OrderDetailsTable).values(values);
		},

		async createOrderDetailsTx(
			tx: TransactionType,
			orderId: number,
			products: Array<{ price: number; productId: number; quantity: number }>,
		) {
			const values = products.map((p) => ({
				orderId,
				price: p.price,
				productId: p.productId,
				quantity: p.quantity,
			}));
			await tx.insert(OrderDetailsTable).values(values);
		},

		async createOrderTx(
			tx: TransactionType,
			data: {
				address: string;
				customerPhone: number;
				deliveryProvider: DeliveryProvider;
				notes: string | null;
				orderNumber: string;
				status: OrderStatus;
				total: number;
			},
		) {
			const result = await tx
				.insert(OrdersTable)
				.values(data)
				.returning({ orderId: OrdersTable.id });
			return result[0];
		},

		async deleteOrderDetailsTx(tx: TransactionType, orderId: number) {
			await tx.delete(OrderDetailsTable).where(eq(OrderDetailsTable.orderId, orderId));
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
									id: true,
									name: true,
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
				createdAt: order.createdAt,
				customerPhone: order.customerPhone,
				id: order.id,
				notes: order.notes,
				orderNumber: order.orderNumber,
				products: order.orderDetails.map((orderDetail) => ({
					id: orderDetail.product.id,
					imageUrl: orderDetail.product.images[0]?.url,
					name: orderDetail.product.name,
					quantity: orderDetail.quantity,
				})),
				status: order.status,
				total: order.total,
				updatedAt: order.updatedAt,
			}));
		},

		async getAverageOrderValue(timerange: "daily" | "weekly" | "monthly") {
			const order = await db().query.OrdersTable.findMany({
				columns: {
					createdAt: true,
					total: true,
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

		async getOrderById(id: number) {
			const result = await db().query.OrdersTable.findFirst({
				where: and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)),
				with: {
					orderDetails: {
						columns: {
							price: true,
							quantity: true,
						},
						with: {
							product: {
								columns: {
									id: true,
									name: true,
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
							createdAt: true,
							paymentNumber: true,
							provider: true,
							status: true,
						},
						where: isNull(PaymentsTable.deletedAt),
					},
				},
			});
			return result ? projectOrderResult(result) : null;
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
							and(between(SalesTable.createdAt, weekStart, weekEnd), isNull(SalesTable.deletedAt)),
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
					date: string;
					orderCount: number;
					salesCount: number;
				}> = [];
				for (let i = 0; i < 7; i++) {
					const { startDate } = getStartAndEndofDayAgo(i);
					const ubDay = new Date(startDate.getTime() + UB_OFFSET_MS);
					const label = `${ubDay.getUTCMonth() + 1}/${ubDay.getUTCDate()}`;
					result.push({
						date: label,
						orderCount: ordersByDay.get(label) ?? 0,
						salesCount: salesByDay.get(label) ?? 0,
					});
				}
				return result;
			} catch {
				return [];
			}
		},

		async getOrderDetailsByOrderIdTx(tx: TransactionType, orderId: number) {
			return tx.select().from(OrderDetailsTable).where(eq(OrderDetailsTable.orderId, orderId));
		},

		async getPaginatedOrders(params: {
			createdAfter?: Date;
			date?: string;
			includeAllStatuses?: boolean;
			orderStatus?: OrderStatus;
			orderStatuses?: Array<OrderStatus>;
			page: number;
			pageSize: number;
			paymentStatus?: PaymentStatusType;
			searchTerm?: string;
			sortDirection?: "asc" | "desc";
			sortField?: string;
		}) {
			const database = db();
			const finalConditions = buildPaginatedOrderConditions(database, params);

			const orderByClauses: Array<SQL<unknown>> = [];
			const primarySortColumn =
				params.sortField === "total" ? OrdersTable.total : OrdersTable.createdAt;

			const primaryOrderBy =
				params.sortDirection === "asc" ? asc(primarySortColumn) : desc(primarySortColumn);

			orderByClauses.push(primaryOrderBy, asc(OrdersTable.id));

			const offset = (params.page - 1) * params.pageSize;

			const orderResults = await database.query.OrdersTable.findMany({
				limit: params.pageSize,
				offset,
				orderBy: orderByClauses,
				where: finalConditions.length > 0 ? and(...finalConditions) : undefined,
				with: {
					orderDetails: {
						columns: { price: true, quantity: true },
						with: {
							product: {
								columns: { id: true, name: true, price: true },
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
							createdAt: true,
							paymentNumber: true,
							provider: true,
							status: true,
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

			const totalCountResult = await database
				.select({ count: sql<number>`COUNT(*)` })
				.from(OrdersTable)
				.where(finalConditions.length > 0 ? and(...finalConditions) : undefined)
				.limit(1);

			const totalCount = totalCountResult[0]?.count ?? 0;
			const totalPages = Math.ceil(totalCount / params.pageSize);

			return {
				orders: projectOrderResults(orderResults),
				pagination: {
					currentPage: params.page,
					hasNextPage: params.page < totalPages,
					hasPreviousPage: params.page > 1,
					totalCount,
					totalPages,
				},
			};
		},

		async getPendingOrders() {
			try {
				const result = await db().query.OrdersTable.findMany({
					orderBy: desc(OrdersTable.createdAt),
					where: and(eq(OrdersTable.status, "pending"), isNull(OrdersTable.deletedAt)),
					with: {
						orderDetails: {
							columns: {
								price: true,
								quantity: true,
							},
							with: {
								product: {
									columns: {
										id: true,
										name: true,
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
								createdAt: true,
								paymentNumber: true,
								provider: true,
								status: true,
							},
							where: isNull(PaymentsTable.deletedAt),
						},
					},
				});
				return projectOrderResults(result);
			} catch {
				return [];
			}
		},

		async getRecentOrdersByProductId(productId: number) {
			const orderDetails = await db().query.OrderDetailsTable.findMany({
				limit: 5,
				orderBy: [asc(OrdersTable.createdAt)],
				where: eq(OrderDetailsTable.productId, productId),
				with: {
					order: {
						columns: {
							createdAt: true,
							customerPhone: true,
							id: true,
							orderNumber: true,
							status: true,
							total: true,
						},
					},
				},
			});

			return orderDetails.map((detail) => detail.order);
		},

		async patchOrderHeader(
			id: number,
			data: {
				address?: string;
				addressZoneId?: number | null;
				customerPhone?: number;
				deliveryProvider?: DeliveryProvider;
				notes?: string | null;
				status?: OrderStatusType;
			},
		) {
			await db()
				.update(OrdersTable)
				.set(data)
				.where(and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)));
		},

		async restoreOrderTx(tx: TransactionType, id: number) {
			await tx
				.update(OrderDetailsTable)
				.set({ deletedAt: null })
				.where(eq(OrderDetailsTable.orderId, id));

			await tx.update(SalesTable).set({ deletedAt: null }).where(eq(SalesTable.orderId, id));

			await tx.update(PaymentsTable).set({ deletedAt: null }).where(eq(PaymentsTable.orderId, id));

			await tx.update(OrdersTable).set({ deletedAt: null }).where(eq(OrdersTable.id, id));
		},

		async searchOrder(searchTerm: string) {
			const orders = await db().query.OrdersTable.findMany({
				where: and(
					isNull(OrdersTable.deletedAt),
					or(
						ilike(OrdersTable.orderNumber, `%${searchTerm}%`),
						ilike(OrdersTable.address, `%${searchTerm}%`),
						like(sql`CAST(${OrdersTable.customerPhone} AS TEXT)`, `%${searchTerm}%`),
					),
				),
				with: {
					orderDetails: {
						columns: {
							price: true,
							quantity: true,
						},
						with: {
							product: {
								columns: {
									id: true,
									name: true,
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
							createdAt: true,
							paymentNumber: true,
							provider: true,
							status: true,
						},
						where: isNull(PaymentsTable.deletedAt),
					},
				},
			});
			return projectOrderResults(orders);
		},

		async searchOrdersQuick(searchTerm: string, limit = 5) {
			const term = searchTerm.trim();
			if (!term) {
				return [];
			}

			return db().query.OrdersTable.findMany({
				columns: {
					createdAt: true,
					customerPhone: true,
					id: true,
					orderNumber: true,
					status: true,
					total: true,
				},
				limit,
				orderBy: desc(OrdersTable.createdAt),
				where: and(
					isNull(OrdersTable.deletedAt),
					or(
						ilike(OrdersTable.orderNumber, `%${term}%`),
						like(sql`CAST(${OrdersTable.customerPhone} AS TEXT)`, `%${term}%`),
					),
				),
			});
		},

		async softDeleteOrderTx(tx: TransactionType, id: number) {
			const now = new Date();
			await tx
				.update(OrderDetailsTable)
				.set({ deletedAt: now })
				.where(eq(OrderDetailsTable.orderId, id));

			await tx.update(SalesTable).set({ deletedAt: now }).where(eq(SalesTable.orderId, id));

			await tx.update(PaymentsTable).set({ deletedAt: now }).where(eq(PaymentsTable.orderId, id));

			await tx.update(OrdersTable).set({ deletedAt: now }).where(eq(OrdersTable.id, id));
		},

		async updateOrderStatus(
			id: number,
			status: OrderStatus,
			options?: {
				addressZoneId?: number | null;
				deliveryProvider?: DeliveryProvider;
				fromStatus?: OrderStatus;
			},
		) {
			const patch = { status };
			if (options?.deliveryProvider !== undefined) {
				patch.deliveryProvider = options.deliveryProvider;
			}
			if (options?.addressZoneId !== undefined) {
				patch.addressZoneId = options.addressZoneId;
			}
			const conditions = [eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)];
			if (options?.fromStatus !== undefined) {
				conditions.push(eq(OrdersTable.status, options.fromStatus));
			}
			const updated = await db()
				.update(OrdersTable)
				.set(patch)
				.where(and(...conditions))
				.returning({ id: OrdersTable.id });
			return updated.length > 0;
		},

		async updateOrderTx(
			tx: TransactionType,
			id: number,
			data: {
				address?: string;
				addressZoneId?: number | null;
				customerPhone?: number;
				deliveryProvider?: DeliveryProvider;
				notes?: string | null;
				status?: OrderStatusType;
				total?: number;
			},
		) {
			await tx.update(OrdersTable).set(data).where(eq(OrdersTable.id, id));
		},
	},

	store: {
		async createOrder(data: {
			address: string;
			addressZoneId: number;
			customerPhone: number;
			deliveryProvider: DeliveryProvider;
			notes: string | null;
			orderNumber: string;
			status: OrderStatus;
			total: number;
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
					payments: {
						columns: {
							createdAt: true,
							paymentNumber: true,
							provider: true,
							status: true,
						},
					},
				},
			});
			return order;
		},

		async getOrdersByCustomerPhone(phone: number) {
			const orders = await db().query.OrdersTable.findMany({
				columns: {
					address: true,
					createdAt: true,
					notes: true,
					orderNumber: true,
					status: true,
					total: true,
				},
				where: and(eq(OrdersTable.customerPhone, phone), isNull(OrdersTable.deletedAt)),
				with: {
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
					payments: {
						columns: {
							createdAt: true,
							paymentNumber: true,
							provider: true,
							status: true,
						},
						orderBy: [desc(PaymentsTable.createdAt)],
						where: isNull(PaymentsTable.deletedAt),
					},
					sales: {
						columns: {
							productId: true,
							sellingPrice: true,
						},
					},
				},
			});
			return orders;
		},

		async getProductsByIds(productIds: Array<number>) {
			const products = await db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				where: inArray(ProductsTable.id, productIds),
			});
			return products;
		},
	},
};
