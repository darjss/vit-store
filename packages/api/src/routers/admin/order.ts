import { TRPCError } from "@trpc/server";
import {
	customerQueries,
	orderQueries,
	paymentQueries,
	productQueries,
	purchaseQueries,
	salesQueries,
} from "@vit/api/queries";
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
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				if (input.isNewCustomer) {
					await customerQueries.admin.createCustomer({
						phone: Number(input.customerPhone),
						address: input.address,
					});
				}

				const orderNumber = generateOrderNumber();
				const order = await orderQueries.admin.createOrder({
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
				await orderQueries.admin.createOrderDetails(orderId, orderDetails);

				if (input.paymentStatus === "success") {
					for (const product of input.products) {
						const productCost =
							await purchaseQueries.admin.getAverageCostOfProduct(
								product.productId,
								new Date(),
							);
						await salesQueries.admin.addSale({
							productCost: productCost,
							quantitySold: product.quantity,
							orderId: order.orderId,
							sellingPrice: product.price,
							productId: product.productId,
						});
						await productQueries.admin.updateStock(
							product.productId,
							product.quantity,
							"minus",
						);
					}
				}

				try {
					const paymentNumber = generatePaymentNumber();
					await paymentQueries.admin.createPayment({
						paymentNumber,
						orderId: orderId,
						provider: "transfer",
						status: input.paymentStatus,
						amount: orderTotal,
					});

					ctx.log.payment.created({
						paymentNumber,
						orderId,
						amount: orderTotal,
						provider: "transfer",
						status: input.paymentStatus,
					});
				} catch (error) {
					ctx.log.error("admin.payment_create_failed", error, { orderId });
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: error,
					});
				}

				ctx.log.order.created({
					orderId,
					orderNumber,
					customerPhone: Number(input.customerPhone),
					total: orderTotal,
					itemCount: input.products.length,
					status: input.status,
				});

				return { message: "Order added successfully" };
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				ctx.log.error("admin.order_add_failed", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add order",
					cause: e,
				});
			}
		}),

	updateOrder: adminProcedure
		.input(updateOrderSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				if (input.isNewCustomer) {
					const existingCustomer =
						await customerQueries.admin.getCustomerByPhone(
							Number(input.customerPhone),
						);
					if (!existingCustomer) {
						await customerQueries.admin.createCustomer({
							phone: Number(input.customerPhone),
							address: input.address,
						});
					} else {
						await customerQueries.admin.updateCustomer(
							Number(input.customerPhone),
							{ address: input.address },
						);
					}
				}

				await orderQueries.admin.updateOrder(input.id, {
					customerPhone: Number(input.customerPhone),
					status: input.status,
					notes: input.notes,
					total: orderTotal,
				});

				const currentOrderDetails =
					await orderQueries.admin.getOrderDetailsByOrderId(input.id);

				await orderQueries.admin.deleteOrderDetails(input.id);

				const orderDetailsPromise = input.products.map(async (product) => {
					await orderQueries.admin.createOrderDetails(input.id, [
						{
							productId: product.productId,
							quantity: product.quantity,
						},
					]);

					const existingDetail = currentOrderDetails.find(
						(detail) => detail.productId === product.productId,
					);
					if (input.paymentStatus === "success") {
						const productCost =
							await purchaseQueries.admin.getAverageCostOfProduct(
								product.productId,
								new Date(),
							);
						await salesQueries.admin.addSale({
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
							await productQueries.admin.updateStock(
								product.productId,
								Math.abs(quantityDiff),
								quantityDiff > 0 ? "minus" : "add",
							);
						}
					} else {
						await productQueries.admin.updateStock(
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
					productQueries.admin.updateStock(
						detail.productId,
						detail.quantity,
						"add",
					),
				);

				await paymentQueries.admin.updatePaymentStatus(
					input.id,
					input.paymentStatus,
				);

				await Promise.allSettled([
					...orderDetailsPromise,
					...restoreStockPromises,
				]);

				ctx.log.order.updated({
					orderId: input.id,
					total: orderTotal,
					status: input.status,
				});

				return { message: "Order updated successfully" };
			} catch (e) {
				ctx.log.error("admin.order_update_failed", e, { orderId: input.id });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update order",
					cause: e,
				});
			}
		}),

	deleteOrder: adminProcedure
		.input(v.object({ id: v.number() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const orderDetails = await orderQueries.admin.getOrderDetailsByOrderId(
					input.id,
				);

				const restoreStockPromises = orderDetails
					.filter((detail) => !detail.deletedAt)
					.map((detail) =>
						productQueries.admin.updateStock(
							detail.productId,
							detail.quantity,
							"add",
						),
					);

				await orderQueries.admin.softDeleteOrder(input.id);
				await Promise.allSettled(restoreStockPromises);

				ctx.log.order.cancelled({ orderId: input.id });

				return { message: "Order deleted successfully" };
			} catch (e) {
				ctx.log.error("admin.order_delete_failed", e, { orderId: input.id });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete order",
					cause: e,
				});
			}
		}),

	restoreOrder: adminProcedure
		.input(v.object({ id: v.number() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const details = await orderQueries.admin.getOrderDetailsByOrderId(
					input.id,
				);

				const deductPromises = details
					.filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)
					.map((d) =>
						productQueries.admin.updateStock(d.productId, d.quantity, "minus"),
					);

				await Promise.allSettled(deductPromises);
				await orderQueries.admin.restoreOrder(input.id);

				ctx.log.admin.action({
					action: "restore_order",
					targetType: "order",
					targetId: input.id,
				});

				return { message: "Order restored successfully" };
			} catch (e) {
				ctx.log.error("admin.order_restore_failed", e, { orderId: input.id });
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to restore order",
					cause: e,
				});
			}
		}),

	searchOrder: adminProcedure
		.input(v.object({ searchTerm: v.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const orders = await orderQueries.admin.searchOrder(input.searchTerm);
				return orders;
			} catch (e) {
				ctx.log.error("admin.order_search_failed", e, {
					searchTerm: input.searchTerm,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search order",
					cause: e,
				});
			}
		}),

	searchOrderQuick: adminProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 5),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				return await orderQueries.admin.searchOrdersQuick(
					input.query,
					input.limit,
				);
			} catch (e) {
				ctx.log.error("admin.order_search_quick_failed", e, {
					query: input.query,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search order quick",
					cause: e,
				});
			}
		}),

	getAllOrders: adminProcedure.query(async ({ ctx }) => {
		try {
			const orders = await orderQueries.admin.getAllOrders();
			return orders;
		} catch (e) {
			ctx.log.error("admin.orders_fetch_failed", e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
				cause: e,
			});
		}
	}),

	getOrderById: adminProcedure
		.input(v.object({ id: v.number() }))
		.query(async ({ input, ctx }) => {
			try {
				const result = await orderQueries.admin.getOrderById(input.id);
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Order not found",
					});
				}
				return result;
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				ctx.log.error("admin.order_fetch_failed", e, { orderId: input.id });
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
		.query(async ({ input, ctx }) => {
			try {
				return await orderQueries.admin.getPaginatedOrders({
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
				ctx.log.error("admin.orders_paginated_fetch_failed", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch paginated orders",
					cause: e,
				});
			}
		}),

	getOrderCount: adminProcedure
		.input(v.object({ timeRange: timeRangeSchema }))
		.query(async ({ input }) => {
			return await orderQueries.admin.getOrderCount(input.timeRange);
		}),

	getPendingOrders: adminProcedure.query(async () => {
		return await orderQueries.admin.getPendingOrders();
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
		.mutation(async ({ input, ctx }) => {
			try {
				await orderQueries.admin.updateOrderStatus(input.id, input.status);

				ctx.log.order.statusChanged({
					orderId: input.id,
					status: input.status,
				});

				return {
					message: `Order status updated successfully to ${input.status}`,
				};
			} catch (e) {
				ctx.log.error("admin.order_status_update_failed", e, {
					orderId: input.id,
					status: input.status,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update order status",
					cause: e,
				});
			}
		}),

	getRecentOrdersByProductId: adminProcedure
		.input(v.object({ productId: v.number() }))
		.query(async ({ input, ctx }) => {
			try {
				const orders = await orderQueries.admin.getRecentOrdersByProductId(
					input.productId,
				);
				return orders;
			} catch (e) {
				ctx.log.error("admin.recent_orders_fetch_failed", e, {
					productId: input.productId,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch recent orders",
					cause: e,
				});
			}
		}),
});
