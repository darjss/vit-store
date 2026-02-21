import { TRPCError } from "@trpc/server";
import {
	customerQueries,
	orderQueries,
	paymentQueries,
} from "@vit/api/queries";
import { newOrderSchema } from "@vit/shared";
import * as v from "valibot";
import { sendDetailedOrderNotification } from "../../lib/integrations/messenger/messages";
import { kv } from "../../lib/kv";
import { createSession, setSessionTokenCookie } from "../../lib/session/store";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "../../lib/utils";
import { addCustomerToDB } from "./auth";

export const order = router({
	getOrdersByCustomerId: customerProcedure.query(async ({ ctx }) => {
		try {
			const q = orderQueries.store;
			const customerPhone = ctx.session.user.phone;
			const orders = await q.getOrdersByCustomerPhone(customerPhone);

			ctx.log.order.viewed({
				customerPhone,
				itemCount: orders.length,
			});

			return orders.map((order) => {
				const { orderDetails, sales, ...orderInfo } = order;

				const salesPriceMap = new Map<number, number>();
				for (const sale of sales) {
					salesPriceMap.set(sale.productId, sale.sellingPrice);
				}
				const products = orderDetails.map((detail) => ({
					name: detail.product.name,
					brandName: detail.product.brand.name,
					imageUrl: detail.product.images[0]?.url,
					quantity: detail.quantity,
					sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
				}));
				return {
					...orderInfo,
					products,
				};
			});
		} catch (e) {
			ctx.log.error("order.fetch_failed", e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
				cause: e,
			});
		}
	}),

	addOrder: publicProcedure
		.input(newOrderSchema)
		.mutation(async ({ input, ctx }) => {
			const startTime = performance.now();

			try {
				const storeOrderQ = orderQueries.store;
				const storeCustomerQ = customerQueries.store;
				const _adminPaymentQ = paymentQueries.admin;

				const productsById = new Map<number, number>();
				for (const item of input.products) {
					const productId = Math.trunc(item.productId);
					const quantity = Math.trunc(item.quantity);
					if (productId <= 0 || quantity <= 0) {
						continue;
					}
					productsById.set(
						productId,
						(productsById.get(productId) ?? 0) + quantity,
					);
				}

				const normalizedProducts = Array.from(productsById.entries()).map(
					([productId, quantity]) => ({ productId, quantity }),
				);

				if (normalizedProducts.length === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Сагс хоосон эсвэл буруу байна. Дахин оролдоно уу.",
					});
				}

				const products = await storeOrderQ.getProductsByIds(
					normalizedProducts.map((p) => p.productId),
				);

				const existingProductIds = new Set(products.map((p) => p.id));
				const missingProductIds = normalizedProducts
					.filter((p) => !existingProductIds.has(p.productId))
					.map((p) => p.productId);

				if (missingProductIds.length > 0) {
					ctx.log.warn("order.invalid_products", {
						missingProductIds,
					});
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Зарим бараа олдсонгүй. Сагсаа шинэчлээд дахин оролдоно уу.",
					});
				}

				const priceByProductId = new Map(products.map((p) => [p.id, p.price]));

				const total = normalizedProducts.reduce((acc, item) => {
					const price = priceByProductId.get(item.productId) ?? 0;
					return acc + price * item.quantity;
				}, 0);

				const customer = await storeCustomerQ.getCustomerByPhone(
					Number(input.phoneNumber),
				);

				if (!customer) {
					await storeCustomerQ.createCustomer({
						phone: Number(input.phoneNumber),
						address: input.address,
					});
				}

				await storeCustomerQ.updateCustomerAddress(
					Number(input.phoneNumber),
					input.address,
				);

				const orderNumber = generateOrderNumber();
				const order = await storeOrderQ.createOrder({
					orderNumber,
					customerPhone: Number(input.phoneNumber),
					address: input.address,
					notes: input.notes ?? null,
					total: total,
					status: "pending",
					deliveryProvider: "tu-delivery",
				});

				const orderId = order?.orderId;
				if (!orderId) {
					ctx.log.error(
						"order.create_failed",
						new Error("No order ID returned"),
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create order",
					});
				}

				const orderDetailsPayload = normalizedProducts.map((p) => ({
					productId: p.productId,
					quantity: p.quantity,
				}));

				let orderDetailsInserted = false;
				for (let attempt = 1; attempt <= 3; attempt++) {
					try {
						await storeOrderQ.createOrderDetails(orderId, orderDetailsPayload);
						orderDetailsInserted = true;
						break;
					} catch (error) {
						const isLastAttempt = attempt === 3;
						ctx.log.warn("order.details_insert_retry", {
							orderId,
							attempt,
							isLastAttempt,
							error:
								error instanceof Error
									? error.message.slice(0, 300)
									: String(error),
						});

						if (isLastAttempt) {
							throw error;
						}

						await new Promise((resolve) => setTimeout(resolve, attempt * 120));
					}
				}

				if (!orderDetailsInserted) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create order details",
					});
				}

				ctx.log.order.created({
					orderId,
					orderNumber,
					customerPhone: Number(input.phoneNumber),
					total,
					itemCount: normalizedProducts.length,
					status: "pending",
				});

				let paymentNumber: string | null = null;
				try {
					const paymentResult = await paymentQueries.store.createPayment({
						paymentNumber: generatePaymentNumber(),
						orderId: orderId,
						provider: "transfer",
						status: "pending",
						amount: total,
					});
					paymentNumber = paymentResult?.paymentNumber ?? null;

					if (paymentNumber) {
						ctx.log.payment.created({
							paymentNumber,
							orderId,
							amount: total,
							provider: "transfer",
							status: "pending",
						});
					}
				} catch (e) {
					ctx.log.error("payment.create_failed", e, { orderId });
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: e,
					});
				}

				const user = await addCustomerToDB(input.phoneNumber);

				if (!user) {
					ctx.log.error(
						"order.customer_create_failed",
						new Error("No user returned"),
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create or retrieve user",
					});
				}

				const { session, token } = await createSession(user, kv());
				setSessionTokenCookie(ctx.c, token, session.expiresAt);

				const durationMs = performance.now() - startTime;
				ctx.log.auth.sessionCreated({
					phone: Number(input.phoneNumber),
					sessionId: session.id,
				});

				ctx.log.info("order.flow_complete", {
					orderId,
					orderNumber,
					paymentNumber,
					durationMs,
				});

				if (paymentNumber) {
					try {
						const paymentInfo =
							await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);

						if (paymentInfo) {
							await sendDetailedOrderNotification({
								paymentNumber,
								customerPhone: paymentInfo.order.customerPhone,
								address: paymentInfo.order.address,
								notes: paymentInfo.order.notes,
								total: paymentInfo.order.total,
								products: paymentInfo.order.orderDetails.map((detail) => ({
									name: detail.product.name,
									quantity: detail.quantity,
									price: detail.product.price,
									imageUrl: detail.product.images[0]?.url,
								})),
								status: "pending_transfer",
							});
						}
					} catch (notificationError) {
						ctx.log.error("order.notification_failed", notificationError, {
							paymentNumber,
							orderNumber,
						});
					}
				}

				return { paymentNumber };
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error("order.add_failed", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add order",
					cause: e,
				});
			}
		}),

	getOrderByOrderNumber: customerProcedure
		.input(v.object({ orderNumber: v.string() }))
		.query(async ({ input, ctx }) => {
			try {
				const q = orderQueries.store;
				const order = await q.getOrderByOrderNumber(input.orderNumber);

				ctx.log.order.viewed({
					orderNumber: input.orderNumber,
				});

				return order;
			} catch (e) {
				ctx.log.error("order.fetch_by_number_failed", e, {
					orderNumber: input.orderNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order",
					cause: e,
				});
			}
		}),
});
