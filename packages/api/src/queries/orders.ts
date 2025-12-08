import type { timeRangeType } from "@vit/shared/schema";
import type { OrderStatusType } from "@vit/shared/types";
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
	or,
	sql,
} from "drizzle-orm";
import type { DB } from "../db";
import {
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	SalesTable,
} from "../db/schema";
import type { deliveryProvider, orderStatus } from "../lib/constants";
import {
	getDaysFromTimeRange,
	getStartAndEndofDayAgo,
	shapeOrderResult,
	shapeOrderResults,
} from "../lib/utils";

type OrderStatus = (typeof orderStatus)[number];
type DeliveryProvider = (typeof deliveryProvider)[number];

export function orderQueries(db: DB) {
	return {
		admin: {
			async getOrderCountForWeek() {
				try {
					const orderPromises: Promise<Array<{ orderCount: number }>>[] = [];
					const salesPromises: Promise<Array<{ salesCount: number }>>[] = [];
					for (let i = 0; i < 7; i++) {
						const { startDate, endDate } = getStartAndEndofDayAgo(i);
						const dayOrderPromise = db
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
							.limit(1);
						orderPromises.push(dayOrderPromise);
						const daySalesPromise = db
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
							.limit(1);
						salesPromises.push(daySalesPromise);
					}
					const orderResults = await Promise.all(orderPromises);
					const salesResults = await Promise.all(salesPromises);
					return orderResults.map((orderResult, i) => {
						const salesResult = salesResults[i];
						const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
						return {
							orderCount: orderResult[0]?.orderCount ?? 0,
							salesCount: salesResult[0]?.salesCount ?? 0,
							date: `${date.getMonth() + 1}/${date.getDate()}`,
						};
					});
				} catch (e) {
					console.error(e);
					return [];
				}
			},

			async getAverageOrderValue(timerange: "daily" | "weekly" | "monthly") {
				const order = await db.query.OrdersTable.findMany({
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
			},

			async getOrderCount(timeRange: timeRangeType) {
				try {
					const result = await db
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
				} catch (e) {
					console.log(e);
					return { count: 0 };
				}
			},

			async getPendingOrders() {
				try {
					const result = await db.query.OrdersTable.findMany({
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
				const result = await db
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
				await db.insert(OrderDetailsTable).values(values);
			},

			async searchOrder(searchTerm: string) {
				const orders = await db.query.OrdersTable.findMany({
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
				return shapeOrderResults(orders);
			},

			async getAllOrders() {
				const result = await db.query.OrdersTable.findMany({
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
				const result = await db.query.OrdersTable.findFirst({
					where: and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)),
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
				return result ? shapeOrderResult(result) : null;
			},

			async getPaginatedOrders(params: {
				page: number;
				pageSize: number;
				paymentStatus?: "pending" | "success" | "failed";
				orderStatus?: OrderStatus;
				sortField?: string;
				sortDirection?: "asc" | "desc";
				searchTerm?: string;
			}) {
				const conditions: (SQL<unknown> | undefined)[] = [];

				if (params.orderStatus !== undefined) {
					conditions.push(eq(OrdersTable.status, params.orderStatus));
				}

				if (params.searchTerm !== undefined) {
					conditions.push(
						or(
							like(OrdersTable.orderNumber, `%${params.searchTerm}%`),
							like(OrdersTable.address, `%${params.searchTerm}%`),
							like(
								sql`CAST(${OrdersTable.customerPhone} AS TEXT)`,
								`%${params.searchTerm}%`,
							),
						),
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

				const orderResults = await db.query.OrdersTable.findMany({
					limit: params.pageSize,
					offset: offset,
					orderBy: orderByClauses,
					where:
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					with: {
						orderDetails: {
							columns: { quantity: true },
							with: {
								product: {
									columns: { name: true, id: true, price: true },
									with: {
										images: {
											columns: { url: true },
											where: eq(ProductImagesTable.isPrimary, true),
										},
									},
								},
							},
						},
						payments: {
							columns: { provider: true, status: true, createdAt: true },
							where:
								params.paymentStatus === undefined
									? undefined
									: eq(PaymentsTable.status, params.paymentStatus),
						},
					},
				});

				let filteredOrders = orderResults;
				if (params.paymentStatus !== undefined) {
					filteredOrders = orderResults.filter((order) =>
						order.payments.some((p) => p.status === params.paymentStatus),
					);
				}

				const totalCountResult = await db
					.select({ count: sql<number>`COUNT(*)` })
					.from(OrdersTable)
					.where(
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					)
					.limit(1);

				const totalCount = totalCountResult[0]?.count ?? 0;
				const totalPages = Math.ceil(totalCount / params.pageSize);

				return {
					orders: shapeOrderResults(filteredOrders),
					pagination: {
						currentPage: params.page,
						totalPages,
						totalCount,
						hasNextPage: params.page < totalPages,
						hasPreviousPage: params.page > 1,
					},
				};
			},

			async updateOrderStatus(id: number, status: OrderStatus) {
				await db
					.update(OrdersTable)
					.set({ status })
					.where(and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)));
			},

			async updateOrder(
				id: number,
				data: {
					customerPhone?: number;
					status?: OrderStatusType;
					notes?: string | null;
					total?: number;
				},
			) {
				await db.update(OrdersTable).set(data).where(eq(OrdersTable.id, id));
			},

			async getOrderDetailsByOrderId(orderId: number) {
				return db
					.select()
					.from(OrderDetailsTable)
					.where(eq(OrderDetailsTable.orderId, orderId));
			},

			async deleteOrderDetails(orderId: number) {
				await db
					.delete(OrderDetailsTable)
					.where(eq(OrderDetailsTable.orderId, orderId));
			},

			async softDeleteOrder(id: number) {
				const now = new Date();
				await db
					.update(OrderDetailsTable)
					.set({ deletedAt: now })
					.where(eq(OrderDetailsTable.orderId, id));

				await db
					.update(SalesTable)
					.set({ deletedAt: now })
					.where(eq(SalesTable.orderId, id));

				await db
					.update(PaymentsTable)
					.set({ deletedAt: now })
					.where(eq(PaymentsTable.orderId, id));

				await db
					.update(OrdersTable)
					.set({ deletedAt: now })
					.where(eq(OrdersTable.id, id));
			},

			async restoreOrder(id: number) {
				await db
					.update(OrderDetailsTable)
					.set({ deletedAt: null })
					.where(eq(OrderDetailsTable.orderId, id));

				await db
					.update(SalesTable)
					.set({ deletedAt: null })
					.where(eq(SalesTable.orderId, id));

				await db
					.update(PaymentsTable)
					.set({ deletedAt: null })
					.where(eq(PaymentsTable.orderId, id));

				await db
					.update(OrdersTable)
					.set({ deletedAt: null })
					.where(eq(OrdersTable.id, id));
			},

			async getRecentOrdersByProductId(productId: number) {
				const orderDetails = await db.query.OrderDetailsTable.findMany({
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
				const orders = await db.query.OrdersTable.findMany({
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
				const products = await db.query.ProductsTable.findMany({
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
				notes: string | null;
				total: number;
				status: OrderStatus;
				deliveryProvider: DeliveryProvider;
			}) {
				const result = await db
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
				await db.insert(OrderDetailsTable).values(values);
			},

			async getOrderByOrderNumber(orderNumber: string) {
				const order = await db.query.OrdersTable.findFirst({
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
}
