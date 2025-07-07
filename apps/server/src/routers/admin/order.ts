import { adminProcedure, router } from "@/lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	addOrderSchema,
	timeRangeSchema,
	updateOrderSchema,
} from "@/lib/zod/schema";
import {
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
} from "@/db/schema";
import { generateOrderNumber, shapeOrderResult } from "@/lib/utils";
import {
	addSale,
	createPayment,
	getAverageCostOfProduct,
	updateStock,
	getOrderCount,
	getPendingOrders,
} from "./utils";
import { and, eq, like, sql, desc, asc, or, gte, gt, lt } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDaysFromTimeRange, shapeOrderResults } from "@/lib/utils";
import { PRODUCT_PER_PAGE } from "@/lib/constants";

export const order = router({
	addOrder: adminProcedure
		.input(addOrderSchema)
		.mutation(async ({ ctx, input }) => {
			console.log("addOrder called with", input);
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				await ctx.db.transaction(async (tx) => {
					if (input.isNewCustomer) {
						await tx.insert(CustomersTable).values({
							phone: input.customerPhone,
							address: input.address,
						});
					}

					const [order] = await tx
						.insert(OrdersTable)
						.values({
							orderNumber: generateOrderNumber(),
							customerPhone: input.customerPhone,
							status: input.status,
							notes: input.notes,
							total: orderTotal,
							address: input.address,
							deliveryProvider: input.deliveryProvider,
						})
						.returning({ orderId: OrdersTable.id });
					
					const orderId = order?.orderId;

					for (const product of input.products) {
						await tx.insert(OrderDetailsTable).values({
							orderId: orderId,
							productId: product.productId,
							quantity: product.quantity,
						});

						if (input.paymentStatus === "success") {
							const productCost = await getAverageCostOfProduct(
								product.productId,
								new Date(),
								ctx,
								tx,
							);
							await addSale(
								{
									productCost: productCost,
									quantitySold: product.quantity,
									orderId: order.orderId,
									sellingPrice: product.price,
									productId: product.productId,
								},
								ctx,
								tx,
							);
							await updateStock(
								product.productId,
								product.quantity,
								"minus",
								ctx,
								tx,
							);
						}
					}

					try {
						const paymentResult = await createPayment(
							orderId,
							ctx,
							input.paymentStatus,
							"transfer",
							tx,
						);
						console.log("Payment created:", paymentResult);
					} catch (error) {
						console.error("Error creating payment:", error);
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create payment",
							cause: error,
						});
					}
					console.log("transaction done");
				});

				console.log("added order");
				return { message: "Order added successfully" };
			} catch (e) {
				if (e instanceof Error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to add order",
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add order",
					cause: e,
				});
			}
		}),

	seedOrder: adminProcedure
		.input(addOrderSchema)
		.mutation(async ({ ctx, input }) => {
			console.log("addOrder called with", input);
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				await ctx.db.transaction(async (tx) => {
					if (input.isNewCustomer) {
						await tx.insert(CustomersTable).values({
							phone: input.customerPhone,
							address: input.address,
						});
					}

					const [order] = await tx
						.insert(OrdersTable)
						.values({
							orderNumber: generateOrderNumber(),
							customerPhone: input.customerPhone,
							status: input.status,
							notes: input.notes,
							total: orderTotal,
							address: input.address,
							deliveryProvider: input.deliveryProvider,
						})
						.returning({ orderId: OrdersTable.id });
					if (order?.orderId === undefined) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create order",
						});
					}
					const orderId = order?.orderId;

					for (const product of input.products) {
						await tx.insert(OrderDetailsTable).values({
							orderId: orderId,
							productId: product.productId,
							quantity: product.quantity,
						});

						if (input.paymentStatus === "success") {
							const productCost = await getAverageCostOfProduct(
								product.productId,
								new Date(),
								ctx,
								tx,
							);
							await addSale(
								{
									productCost: productCost,
									quantitySold: product.quantity,
									orderId: order.orderId,
									sellingPrice: product.price,
									productId: product.productId,
								},
								ctx,
								tx,
							);
							await updateStock(
								product.productId,
								product.quantity,
								"minus",
								ctx,
								tx,
							);
						}
					}

					try {
						const paymentResult = await createPayment(
							orderId,
							ctx,
							input.paymentStatus,
							"transfer",
							tx,
						);
						console.log("Payment created:", paymentResult);
					} catch (error) {
						console.error("Error creating payment:", error);
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create payment",
							cause: error,
						});
					}
					console.log("transaction done");
				});

				console.log("added order");
				return { message: "Order added successfully" };
			} catch (e) {
				if (e instanceof Error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to add order",
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add order",
					cause: e,
				});
			}
		}),

	updateOrder: adminProcedure
		.input(updateOrderSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				console.log("updating order");

				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				await ctx.db.transaction(async (tx) => {
					if (input.isNewCustomer) {
						const userExists = await tx
							.select()
							.from(CustomersTable)
							.where(eq(CustomersTable.phone, input.customerPhone))
							.execute();

						if (userExists.length === 0) {
							await tx.insert(CustomersTable).values({
								phone: input.customerPhone,
								address: input.address,
							});
						} else {
							await tx
								.update(CustomersTable)
								.set({ address: input.address })
								.where(eq(CustomersTable.phone, input.customerPhone));
						}
					}

					await tx
						.update(OrdersTable)
						.set({
							customerPhone: input.customerPhone,
							status: input.status,
							notes: input.notes,
							total: orderTotal,
						})
						.where(eq(OrdersTable.id, input.id));

					const currentOrderDetails = await tx
						.select()
						.from(OrderDetailsTable)
						.where(eq(OrderDetailsTable.orderId, input.id))
						.execute();

					await tx
						.delete(OrderDetailsTable)
						.where(eq(OrderDetailsTable.orderId, input.id));

					const orderDetailsPromise = input.products.map(async (product) => {
						await tx.insert(OrderDetailsTable).values({
							orderId: input.id,
							productId: product.productId,
							quantity: product.quantity,
						});

						const existingDetail = currentOrderDetails.find(
							(detail) => detail.productId === product.productId,
						);
						if (input.paymentStatus === "success") {
							const productCost = await getAverageCostOfProduct(
								product.productId,
								new Date(),
								ctx,
								tx,
							);
							await addSale(
								{
									productCost: productCost,
									quantitySold: product.quantity,
									orderId: input.id,
									sellingPrice: product.price,
									productId: product.productId,
								},
								ctx,
								tx,
							);
						}
						if (existingDetail) {
							const quantityDiff = product.quantity - existingDetail.quantity;
							if (quantityDiff !== 0) {
								await updateStock(
									product.productId,
									Math.abs(quantityDiff),
									quantityDiff > 0 ? "minus" : "add",
									ctx,
									tx,
								);
							}
						} else {
							await updateStock(
								product.productId,
								product.quantity,
								"minus",
								ctx,
								tx,
							);
						}
					});

					const removedProducts = currentOrderDetails.filter(
						(detail) =>
							!input.products.some((p) => p.productId === detail.productId),
					);

					const restoreStockPromises = removedProducts.map((detail) =>
						updateStock(detail.productId, detail.quantity, "add", ctx, tx),
					);

					const paymentUpdatePromise = tx
						.update(PaymentsTable)
						.set({ status: input.paymentStatus })
						.where(eq(PaymentsTable.orderId, input.id));

					await Promise.allSettled([
						...orderDetailsPromise,
						...restoreStockPromises,
						paymentUpdatePromise,
					]);
				});

				return { message: "Order updated successfully" };
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update order",
					cause: e,
				});
			}
		}),

	deleteOrder: adminProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.transaction(async (tx) => {
					const orderDetails = await tx
						.select()
						.from(OrderDetailsTable)
						.where(eq(OrderDetailsTable.orderId, input.id))
						.execute();

					const restoreStockPromises = orderDetails.map((detail) =>
						updateStock(detail.productId, detail.quantity, "add", ctx, tx),
					);

					await tx
						.delete(OrderDetailsTable)
						.where(eq(OrderDetailsTable.orderId, input.id));

					await tx.delete(OrdersTable).where(eq(OrdersTable.id, input.id));

					await Promise.allSettled(restoreStockPromises);
				});

				return { message: "Order deleted successfully" };
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete order",
					cause: e,
				});
			}
		}),

	searchOrder: adminProcedure
		.input(z.object({ searchTerm: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const orders = await ctx.db.query.OrdersTable.findMany({
					where: or(
						like(OrdersTable.orderNumber, `%${input.searchTerm}%`),
						like(OrdersTable.address, `%${input.searchTerm}%`),
						like(OrdersTable.customerPhone, `%${input.searchTerm}%`),
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

				return shapeOrderResults(orders);
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search order",
					cause: e,
				});
			}
		}),

	getAllOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db.query.OrdersTable.findMany({
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
										where: eq(ProductImagesTable.isPrimary, true),
									},
								},
							},
						},
					},
				},
			});
			const orders = result.map((order) => ({
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
			return orders;
		} catch (e) {
			if (e instanceof Error) {
				return { message: "Fetching orders failed", error: e.message };
			}
			console.log("error", e);
			return { message: "Fetching orders failed", error: "Unknown error" };
		}
	}),

	getOrderById: adminProcedure
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			try {
				const result = await ctx.db.query.OrdersTable.findFirst({
					where: eq(OrdersTable.id, input.id),
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
				return shapeOrderResult(result);
			} catch (e) {
				if (e instanceof Error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch order",
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order",
					cause: e,
				});
			}
		}),

	getPaginatedOrders: adminProcedure
		.input(
			z.object({
				page: z.number().default(1),
				pageSize: z.number().default(PRODUCT_PER_PAGE),
				paymentStatus: z.enum(["pending", "success", "failed"]).optional(),
				orderStatus: z
					.enum(["pending", "shipped", "delivered", "cancelled", "refunded"])
					.optional(),
				sortField: z.string().optional(),
				sortDirection: z.enum(["asc", "desc"]).default("asc"),
			}),
		)
		.query(async ({ ctx, input }) => {
			console.log(
				"Fetching paginated orders with page:",
				input.page,
				"pageSize:",
				input.pageSize,
				"paymentStatus:",
				input.paymentStatus,
				"orderStatus:",
				input.orderStatus,
				"sortField:",
				input.sortField,
				"sortDirection:",
				input.sortDirection,
			);

			try {
				const conditions: (SQL<unknown> | undefined)[] = [];

				if (input.orderStatus !== undefined) {
					conditions.push(eq(OrdersTable.status, input.orderStatus));
				}

				const orderByClauses: SQL<unknown>[] = [];
				const primarySortColumn =
					input.sortField === "total"
						? OrdersTable.total
						: OrdersTable.createdAt;

				const primaryOrderBy =
					input.sortDirection === "asc"
						? asc(primarySortColumn)
						: desc(primarySortColumn);

				orderByClauses.push(primaryOrderBy);
				orderByClauses.push(asc(OrdersTable.id));

				const finalConditions = conditions.filter(
					(c): c is SQL<unknown> => c !== undefined,
				);

				// Calculate offset
				const offset = (input.page - 1) * input.pageSize;

				const orderResults = await ctx.db.query.OrdersTable.findMany({
					limit: input.pageSize,
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
								input.paymentStatus === undefined
									? undefined
									: eq(PaymentsTable.status, input.paymentStatus),
						},
					},
				});

				let filteredOrders = orderResults;
				if (input.paymentStatus !== undefined) {
					filteredOrders = orderResults.filter((order) =>
						order.payments.some((p) => p.status === input.paymentStatus),
					);
				}

				// Get total count for pagination info
				const totalCountResult = await ctx.db
					.select({ count: sql<number>`COUNT(*)` })
					.from(OrdersTable)
					.where(
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					)
					.get();

				const totalCount = totalCountResult?.count ?? 0;
				const totalPages = Math.ceil(totalCount / input.pageSize);

				const shapedOrders = shapeOrderResults(filteredOrders);

				return {
					orders: shapedOrders,
					pagination: {
						currentPage: input.page,
						totalPages,
						totalCount,
						hasNextPage: input.page < totalPages,
						hasPreviousPage: input.page > 1,
					},
				};
			} catch (e) {
				if (e instanceof Error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch paginated orders",
						cause: e,
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch paginated orders",
					cause: e,
				});
			}
		}),

	getOrderCount: adminProcedure
		.input(z.object({ timeRange: timeRangeSchema }))
		.query(async ({ ctx, input }) => {
			return await getOrderCount(ctx, input.timeRange);
		}),

	getPendingOrders: adminProcedure.query(async ({ ctx }) => {
		return await getPendingOrders(ctx);
	}),

	updateOrderStatus: adminProcedure
		.input(
			z.object({
				id: z.number(),
				status: z.enum([
					"pending",
					"shipped",
					"delivered",
					"cancelled",
					"refunded",
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db
					.update(OrdersTable)
					.set({ status: input.status })
					.where(eq(OrdersTable.id, input.id));
				return {
					message: `Order status updated successfully to ${input.status}`,
				};
			} catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update order status",
					cause: e,
				});
			}
		}),
});
