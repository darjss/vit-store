import { TRPCError } from "@trpc/server";
import { adminQueries } from "@vit/api/queries";
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
	addOrder: adminProcedure.input(addOrderSchema).mutation(async ({ input }) => {
		console.log("addOrder called with", input);
		try {
			const orderTotal = input.products.reduce(
				(acc, currentProduct) =>
					acc + currentProduct.price * currentProduct.quantity,
				0,
			);

			if (input.isNewCustomer) {
				await adminQueries.createCustomer({
					phone: Number(input.customerPhone),
					address: input.address,
				});
			}
			const orderNumber = generateOrderNumber();
			const order = await adminQueries.createOrder({
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
			await adminQueries.createOrderDetails(orderId, orderDetails);

			if (input.paymentStatus === "success") {
				for (const product of input.products) {
					const productCost = await adminQueries.getAverageCostOfProduct(
						product.productId,
						new Date(),
					);
					await adminQueries.addSale({
						productCost: productCost,
						quantitySold: product.quantity,
						orderId: order.orderId,
						sellingPrice: product.price,
						productId: product.productId,
					});
					await adminQueries.updateStock(
						product.productId,
						product.quantity,
						"minus",
					);
				}
			}

			try {
				const paymentResult = await adminQueries.createPayment({
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
				console.log("updating order");

				const orderTotal = input.products.reduce(
					(acc, currentProduct) =>
						acc + currentProduct.price * currentProduct.quantity,
					0,
				);

				if (input.isNewCustomer) {
					const existingCustomer = await adminQueries.getCustomerByPhone(
						Number(input.customerPhone),
					);
					if (!existingCustomer) {
						await adminQueries.createCustomer({
							phone: Number(input.customerPhone),
							address: input.address,
						});
					} else {
						await adminQueries.updateCustomer(Number(input.customerPhone), {
							address: input.address,
						});
					}
				}

				await adminQueries.updateOrder(input.id, {
					customerPhone: Number(input.customerPhone),
					status: input.status,
					notes: input.notes,
					total: orderTotal,
				});

				const currentOrderDetails = await adminQueries.getOrderDetailsByOrderId(
					input.id,
				);

				await adminQueries.deleteOrderDetails(input.id);

				const orderDetailsPromise = input.products.map(async (product) => {
					await adminQueries.createOrderDetails(input.id, [
						{
							productId: product.productId,
							quantity: product.quantity,
						},
					]);

					const existingDetail = currentOrderDetails.find(
						(detail) => detail.productId === product.productId,
					);
					if (input.paymentStatus === "success") {
						const productCost = await adminQueries.getAverageCostOfProduct(
							product.productId,
							new Date(),
						);
						await adminQueries.addSale({
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
							await adminQueries.updateStock(
								product.productId,
								Math.abs(quantityDiff),
								quantityDiff > 0 ? "minus" : "add",
							);
						}
					} else {
						await adminQueries.updateStock(
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
					adminQueries.updateStock(detail.productId, detail.quantity, "add"),
				);

				await adminQueries.updatePaymentStatus(input.id, input.paymentStatus);

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
				console.log("deleting order", input.id);
				const orderDetails = await adminQueries.getOrderDetailsByOrderId(
					input.id,
				);

				const restoreStockPromises = orderDetails
					.filter((detail) => !detail.deletedAt)
					.map((detail) =>
						adminQueries.updateStock(detail.productId, detail.quantity, "add"),
					);

				await adminQueries.softDeleteOrder(input.id);

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
				// Deduct stock again based on soft-deleted details
				const details = await adminQueries.getOrderDetailsByOrderId(input.id);

				const deductPromises = details
					.filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)
					.map((d) =>
						adminQueries.updateStock(d.productId, d.quantity, "minus"),
					);

				await Promise.allSettled(deductPromises);

				await adminQueries.restoreOrder(input.id);

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
				const orders = await adminQueries.searchOrder(input.searchTerm);
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
			const orders = await adminQueries.getAllOrders();
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
				const result = await adminQueries.getOrderById(input.id);
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
				return await adminQueries.getPaginatedOrders({
					page: input.page ?? 1,
					pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
					paymentStatus: input.paymentStatus,
					orderStatus: input.orderStatus,
					sortField: input.sortField,
					sortDirection: input.sortDirection,
					searchTerm: input.searchTerm,
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
			return await adminQueries.getOrderCount(input.timeRange);
		}),

	getPendingOrders: adminProcedure.query(async ({ ctx }) => {
		return await adminQueries.getPendingOrders();
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
				await adminQueries.updateOrderStatus(input.id, input.status);
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
				const orders = await adminQueries.getRecentOrdersByProductId(
					input.productId,
				);
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
