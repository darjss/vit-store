import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	SalesTable,
} from "@/db/schema";
import { PRODUCT_PER_PAGE } from "@/lib/constants";
import { adminProcedure, router } from "@/lib/trpc";
import {
	generateOrderNumber,
	shapeOrderResult,
	shapeOrderResults,
} from "@/lib/utils";
import {
	addOrderSchema,
	timeRangeSchema,
	updateOrderSchema,
} from "@/lib/zod/schema";
import {
	addSale,
	createPayment,
	getAverageCostOfProduct,
	getOrderCount,
	getPendingOrders,
	updateStock,
} from "./utils";

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

				if (input.isNewCustomer) {
					await ctx.db.insert(CustomersTable).values({
						phone: Number(input.customerPhone),
						address: input.address,
					});
				}
				const orderNumber = generateOrderNumber();
				const [order] = await ctx.db
					.insert(OrdersTable)
					.values({
						orderNumber: orderNumber,
						customerPhone: Number(input.customerPhone),
						status: input.status,
						notes: input.notes,
						total: orderTotal,
						address: input.address,
						deliveryProvider: input.deliveryProvider,
					})
					.returning({ orderId: OrdersTable.id });

				const orderId = order?.orderId;

				for (const product of input.products) {
					await ctx.db.insert(OrderDetailsTable).values({
						orderId: orderId,
						productId: product.productId,
						quantity: product.quantity,
					});

					if (input.paymentStatus === "success") {
						const productCost = await getAverageCostOfProduct(
							product.productId,
							new Date(),
							ctx,
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
						);
						await updateStock(
							product.productId,
							product.quantity,
							"minus",
							ctx,
						);
					}
				}

				try {
					const paymentResult = await createPayment(
						orderId,
						ctx,
						input.paymentStatus,
						"transfer",
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

				if (input.isNewCustomer) {
					const userExists = await ctx.db
						.select()
						.from(CustomersTable)
						.where(eq(CustomersTable.phone, Number(input.customerPhone)))
						.execute();

					if (userExists.length === 0) {
						await ctx.db.insert(CustomersTable).values({
							phone: Number(input.customerPhone),
							address: input.address,
						});
					} else {
						await ctx.db
							.update(CustomersTable)
							.set({ address: input.address })
							.where(eq(CustomersTable.phone, Number(input.customerPhone)));
					}
				}

				await ctx.db
					.update(OrdersTable)
					.set({
						customerPhone: Number(input.customerPhone),
						status: input.status,
						notes: input.notes,
						total: orderTotal,
					})
					.where(eq(OrdersTable.id, input.id));

				const currentOrderDetails = await ctx.db
					.select()
					.from(OrderDetailsTable)
					.where(eq(OrderDetailsTable.orderId, input.id))
					.execute();

				await ctx.db
					.delete(OrderDetailsTable)
					.where(eq(OrderDetailsTable.orderId, input.id));

				const orderDetailsPromise = input.products.map(async (product) => {
					await ctx.db.insert(OrderDetailsTable).values({
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
							);
						}
					} else {
						await updateStock(
							product.productId,
							product.quantity,
							"minus",
							ctx,
						);
					}
				});

				const removedProducts = currentOrderDetails.filter(
					(detail) =>
						!input.products.some((p) => p.productId === detail.productId),
				);

				const restoreStockPromises = removedProducts.map((detail) =>
					updateStock(detail.productId, detail.quantity, "add", ctx),
				);

				const paymentUpdatePromise = ctx.db
					.update(PaymentsTable)
					.set({ status: input.paymentStatus })
					.where(eq(PaymentsTable.orderId, input.id));

				await Promise.allSettled([
					...orderDetailsPromise,
					...restoreStockPromises,
					paymentUpdatePromise,
				]);

				return { message: "Order updated successfully" };
			} catch (e) {
				console.error(e);
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
				console.log("deleting order", input.id);
				const orderDetails = await ctx.db
					.select()
					.from(OrderDetailsTable)
					.where(
						and(
							eq(OrderDetailsTable.orderId, input.id),
							isNull(OrderDetailsTable.deletedAt),
						),
					)
					.execute();

				const restoreStockPromises = orderDetails.map((detail) =>
					updateStock(detail.productId, detail.quantity, "add", ctx),
				);

				const now = new Date();

				await ctx.db
					.update(OrderDetailsTable)
					.set({ deletedAt: now })
					.where(eq(OrderDetailsTable.orderId, input.id));

				await ctx.db
					.update(SalesTable)
					.set({ deletedAt: now })
					.where(eq(SalesTable.orderId, input.id));

				await ctx.db
					.update(PaymentsTable)
					.set({ deletedAt: now })
					.where(eq(PaymentsTable.orderId, input.id));

				await ctx.db
					.update(OrdersTable)
					.set({ deletedAt: now })
					.where(eq(OrdersTable.id, input.id));

				await Promise.allSettled(restoreStockPromises);

				return { message: "Order deleted successfully" };
			} catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete order",
					cause: e,
				});
			}
		}),

	restoreOrder: adminProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				// Deduct stock again based on soft-deleted details
				const details = await ctx.db
					.select()
					.from(OrderDetailsTable)
					.where(eq(OrderDetailsTable.orderId, input.id));

				const deductPromises = details
					.filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)
					.map((d) => updateStock(d.productId, d.quantity, "minus", ctx));

				await Promise.allSettled(deductPromises);

				await ctx.db
					.update(OrderDetailsTable)
					.set({ deletedAt: null })
					.where(eq(OrderDetailsTable.orderId, input.id));

				await ctx.db
					.update(SalesTable)
					.set({ deletedAt: null })
					.where(eq(SalesTable.orderId, input.id));

				await ctx.db
					.update(PaymentsTable)
					.set({ deletedAt: null })
					.where(eq(PaymentsTable.orderId, input.id));

				await ctx.db
					.update(OrdersTable)
					.set({ deletedAt: null })
					.where(eq(OrdersTable.id, input.id));

				return { message: "Order restored successfully" };
			} catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to restore order",
					cause: e,
				});
			}
		}),

	searchOrder: adminProcedure
		.input(z.object({ searchTerm: z.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const orders = await ctx.db.query.OrdersTable.findMany({
					where: and(
						isNull(OrdersTable.deletedAt),
						or(
							ilike(OrdersTable.orderNumber, `%${input.searchTerm}%`),
							ilike(OrdersTable.address, `%${input.searchTerm}%`),
							ilike(OrdersTable.customerPhone, `%${input.searchTerm}%`),
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
			} catch (e) {
				console.error(e);
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch orders",
					cause: e,
				});
			}
			console.log("error", e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
				cause: e,
			});
		}
	}),

	getOrderById: adminProcedure
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			try {
				const result = await ctx.db.query.OrdersTable.findFirst({
					where: and(
						eq(OrdersTable.id, input.id),
						isNull(OrdersTable.deletedAt),
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
				if (result === undefined) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Order not found",
					});
				}
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
				searchTerm: z.string().optional(),
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
				"searchTerm:",
				input.searchTerm,
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

				if (input.searchTerm !== undefined) {
					conditions.push(
						or(
							like(OrdersTable.orderNumber, `%${input.searchTerm}%`),
							like(OrdersTable.address, `%${input.searchTerm}%`),
							like(OrdersTable.customerPhone, `%${input.searchTerm}%`),
						),
					);
				}

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

				const totalCountResult = await ctx.db
					.select({ count: sql<number>`COUNT(*)` })
					.from(OrdersTable)
					.where(
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					)
					.get();

				const totalCount = totalCountResult?.count ?? 0;
				const totalPages = Math.ceil(totalCount / input.pageSize);

				return {
					orders: shapeOrderResults(filteredOrders),
					pagination: {
						currentPage: input.page,
						totalPages,
						totalCount,
						hasNextPage: input.page < totalPages,
						hasPreviousPage: input.page > 1,
					},
				};
			} catch (e) {
				console.error(e);
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
			return await getOrderCount( input.timeRange,ctx);
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
					.where(
						and(eq(OrdersTable.id, input.id), isNull(OrdersTable.deletedAt)),
					);
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
	getRecentOrdersByProductId: adminProcedure
		.input(
			z.object({
				productId: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { productId } = input;
				const orderDetails = await ctx.db.query.OrderDetailsTable.findMany({
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
