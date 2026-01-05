import { TRPCError } from "@trpc/server";
import { createQueries } from "@vit/api/queries";
import {
	addOrderSchema,
	timeRangeSchema,
	updateOrderSchema,
} from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE } from "../../lib/constants";
import { adminProcedure, router } from "../../lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "../../lib/utils";

export const order = router({
	addOrder: adminProcedure
		.input(addOrderSchema)
		.mutation(async ({ input, ctx }) => {
			console.log("addOrder called with", input);
			try {
				const q = createQueries(ctx.db);
				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				if (input.isNewCustomer) {
					await q.customers.admin.createCustomer({
						phone: Number(input.customerPhone),
						address: input.address,
					});
				}
				const orderNumber = generateOrderNumber();
				const order = await q.orders.admin.createOrder({
					orderNumber: orderNumber,
					customerPhone: Number(input.customerPhone),
					status: input.status,
					notes: input.notes ?? null,
					total: orderTotal,
					address: input.address,
					deliveryProvider: input.deliveryProvider,
				});

				const orderId = order?.orderId;

				const orderDetails = input.products.map((product) => ({
					productId: product.productId,
					quantity: product.quantity,
				}));
				await q.orders.admin.createOrderDetails(orderId, orderDetails);

				if (input.paymentStatus === "success") {
					for (const product of input.products) {
						const productCost = await q.purchases.admin.getAverageCostOfProduct(
							product.productId,
							new Date(),
						);
						await q.sales.admin.addSale({
							productCost: productCost,
							quantitySold: product.quantity,
							orderId: order.orderId,
							sellingPrice: product.price,
							productId: product.productId,
						});
						await q.products.admin.updateStock(
							product.productId,
							product.quantity,
							"minus",
						);
					}
				}

				try {
					const paymentResult = await q.payments.admin.createPayment({
						paymentNumber: generatePaymentNumber(),
						orderId: orderId,
						provider: "transfer",
						status: input.paymentStatus,
						amount: orderTotal,
					});
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
				const q = createQueries(ctx.db);
				console.log("updating order");

				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				if (input.isNewCustomer) {
					const existingCustomer = await q.customers.admin.getCustomerByPhone(
						Number(input.customerPhone),
					);
					if (!existingCustomer) {
						await q.customers.admin.createCustomer({
							phone: Number(input.customerPhone),
							address: input.address,
						});
					} else {
						await q.customers.admin.updateCustomer(
							Number(input.customerPhone),
							{
								address: input.address,
							},
						);
					}
				}

				await q.orders.admin.updateOrder(input.id, {
					customerPhone: Number(input.customerPhone),
					status: input.status,
					notes: input.notes,
					total: orderTotal,
				});

				const currentOrderDetails =
					await q.orders.admin.getOrderDetailsByOrderId(input.id);

				await q.orders.admin.deleteOrderDetails(input.id);

				const orderDetailsPromise = input.products.map(async (product) => {
					await q.orders.admin.createOrderDetails(input.id, [
						{
							productId: product.productId,
							quantity: product.quantity,
						},
					]);

					const existingDetail = currentOrderDetails.find(
						(detail) => detail.productId === product.productId,
					);
					if (input.paymentStatus === "success") {
						const productCost = await q.purchases.admin.getAverageCostOfProduct(
							product.productId,
							new Date(),
						);
						await q.sales.admin.addSale({
							productCost: productCost,
							quantitySold: product.quantity,
							orderId: input.id,
							sellingPrice: product.price,
							productId: product.productId,
						});
					}
					if (existingDetail) {
						const quantityDiff = product.quantity - existingDetail.quantity;
						if (quantityDiff !== 0) {
							await q.products.admin.updateStock(
								product.productId,
								Math.abs(quantityDiff),
								quantityDiff > 0 ? "minus" : "add",
							);
						}
					} else {
						await q.products.admin.updateStock(
							product.productId,
							product.quantity,
							"minus",
						);
					}
				});

				const removedProducts = currentOrderDetails.filter(
					(detail) =>
						!input.products.some((p) => p.productId === detail.productId),
				);

				const restoreStockPromises = removedProducts.map((detail) =>
					q.products.admin.updateStock(
						detail.productId,
						detail.quantity,
						"add",
					),
				);

				await q.payments.admin.updatePaymentStatus(
					input.id,
					input.paymentStatus,
				);

				await Promise.allSettled([
					...orderDetailsPromise,
					...restoreStockPromises,
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
		.input(v.object({ id: v.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db);
				console.log("deleting order", input.id);
				const orderDetails = await q.orders.admin.getOrderDetailsByOrderId(
					input.id,
				);

				const restoreStockPromises = orderDetails
					.filter((detail) => !detail.deletedAt)
					.map((detail) =>
						q.products.admin.updateStock(
							detail.productId,
							detail.quantity,
							"add",
						),
					);

				await q.orders.admin.softDeleteOrder(input.id);

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
		.input(v.object({ id: v.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db);
				// Deduct stock again based on soft-deleted details
				const details = await q.orders.admin.getOrderDetailsByOrderId(input.id);

				const deductPromises = details
					.filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)
					.map((d) =>
						q.products.admin.updateStock(d.productId, d.quantity, "minus"),
					);

				await Promise.allSettled(deductPromises);

				await q.orders.admin.restoreOrder(input.id);

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
		.input(v.object({ searchTerm: v.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).orders.admin;
				const orders = await q.searchOrder(input.searchTerm);
				return orders;
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
			const q = createQueries(ctx.db).orders.admin;
			const orders = await q.getAllOrders();
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
		.input(v.object({ id: v.number() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).orders.admin;
				const result = await q.getOrderById(input.id);
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Order not found",
					});
				}
				return result;
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
			v.object({
				page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
				pageSize: v.optional(
					v.pipe(v.number(), v.integer(), v.minValue(1)),
					PRODUCT_PER_PAGE,
				),
				paymentStatus: v.optional(v.picklist(["pending", "success", "failed"])),
				orderStatus: v.optional(
					v.picklist([
						"pending",
						"shipped",
						"delivered",
						"cancelled",
						"refunded",
					]),
				),
				sortField: v.optional(v.string()),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
				searchTerm: v.optional(v.string()),
				date: v.optional(v.string()),
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
				"date:",
				input.date,
			);

			try {
				const q = createQueries(ctx.db).orders.admin;
				return await q.getPaginatedOrders({
					page: input.page ?? 1,
					pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
					paymentStatus: input.paymentStatus,
					orderStatus: input.orderStatus,
					sortField: input.sortField,
					sortDirection: input.sortDirection,
					searchTerm: input.searchTerm,
					date: input.date,
				});
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
		.input(v.object({ timeRange: timeRangeSchema }))
		.query(async ({ ctx, input }) => {
			const q = createQueries(ctx.db).orders.admin;
			return await q.getOrderCount(input.timeRange);
		}),

	getPendingOrders: adminProcedure.query(async ({ ctx }) => {
		const q = createQueries(ctx.db).orders.admin;
		return await q.getPendingOrders();
	}),

	updateOrderStatus: adminProcedure
		.input(
			v.object({
				id: v.number(),
				status: v.picklist([
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
				const q = createQueries(ctx.db).orders.admin;
				await q.updateOrderStatus(input.id, input.status);
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
			v.object({
				productId: v.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).orders.admin;
				const orders = await q.getRecentOrdersByProductId(input.productId);
				return orders;
			} catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch recent orders",
					cause: e,
				});
			}
		}),
});
