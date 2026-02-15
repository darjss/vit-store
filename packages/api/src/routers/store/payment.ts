import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider } from "../../lib/constants";
import {
	sendDetailedOrderNotification,
	sendTransferNotification,
} from "../../lib/integrations/messenger/messages";
import { kv } from "../../lib/kv";
import {
	createQpayInvoice,
	type InvoiceResponse,
} from "../../lib/payments/qpay";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
export const payment = router({
	getPaymentByNumber: customerProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = paymentQueries.store;
				const payment = await q.getPaymentInfoByNumber(input.paymentNumber);

				if (!payment) {
					ctx.log.warn("payment.not_found", {
						paymentNumber: input.paymentNumber,
					});
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}

				if (ctx.session.user.phone !== payment.order.customerPhone) {
					ctx.log.warn("payment.unauthorized_access", {
						paymentNumber: input.paymentNumber,
						requestedBy: ctx.session.user.phone,
						belongsTo: payment.order.customerPhone,
					});
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this payment",
					});
				}

				ctx.log.info("payment.viewed", {
					paymentNumber: input.paymentNumber,
					status: payment.status,
				});

				return {
					paymentNumber: payment.paymentNumber,
					status: payment.status,
					provider: payment.provider,
					createdAt: payment.createdAt,
					total: payment.order.total,
					order: {
						orderNumber: payment.order.orderNumber,
						status: payment.order.status,
						address: payment.order.address,
						notes: payment.order.notes,
						createdAt: payment.order.createdAt,
						products: payment.order.orderDetails.map((detail) => ({
							productId: detail.product.id,
							name: detail.product.name,
							price: detail.product.price,
							quantity: detail.quantity,
							imageUrl: detail.product.images[0]?.url,
						})),
					},
				};
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error("payment.fetch_failed", e, {
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch payment",
					cause: e,
				});
			}
		}),

	confirmPayment: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				provider: v.optional(v.picklist(paymentProvider)),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const q = paymentQueries.store;
				await q.confirmPayment(input.paymentNumber, input.provider);

				try {
					const paymentInfo = await q.getPaymentInfoByNumber(
						input.paymentNumber,
					);
					if (paymentInfo) {
						await sendDetailedOrderNotification({
							paymentNumber: input.paymentNumber,
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
							status: "payment_confirmed",
						});
					}
				} catch (notificationError) {
					ctx.log.error(
						"payment.confirm_notification_failed",
						notificationError,
						{
							paymentNumber: input.paymentNumber,
						},
					);
				}

				ctx.log.payment.confirmed({
					paymentNumber: input.paymentNumber,
					provider: input.provider,
				});
			} catch (e) {
				ctx.log.error("payment.confirm_failed", e, {
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to confirm payment",
					cause: e,
				});
			}
		}),

	sendTransferNotification: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const q = paymentQueries.store;

				ctx.log.info("payment.notification_sending", {
					paymentNumber: input.paymentNumber,
				});

				const payment = await q.getPaymentByNumber(input.paymentNumber);
				if (!payment) {
					ctx.log.warn("payment.notification_not_found", {
						paymentNumber: input.paymentNumber,
					});
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}

				await sendTransferNotification(payment.paymentNumber, payment.amount);

				ctx.log.payment.notificationSent({
					paymentNumber: payment.paymentNumber,
					amount: payment.amount,
					orderNumber: payment.order.orderNumber,
				});

				return {
					orderNumber: payment.order.orderNumber,
				};
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error("payment.notification_failed", e, {
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send notification",
					cause: e,
				});
			}
		}),

	getPaymentStatus: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.query(async ({ input, ctx }) => {
			try {
				const q = paymentQueries.store;
				const payment = await q.getPaymentByNumber(input.paymentNumber);

				if (!payment) {
					ctx.log.warn("payment.status_not_found", {
						paymentNumber: input.paymentNumber,
					});
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}

				ctx.log.info("payment.status_checked", {
					paymentNumber: input.paymentNumber,
					status: payment.status,
					provider: payment.provider,
				});

				return {
					status: payment.status,
					provider: payment.provider,
				};
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error("payment.status_check_failed", e, {
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get payment status",
					cause: e,
				});
			}
		}),
	createQr: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ input, ctx }): Promise<InvoiceResponse> => {
			try {
				const responseFromKv = await kv().get(`QPAY:${input.paymentNumber}`);
				if (responseFromKv) {
					return JSON.parse(responseFromKv) as InvoiceResponse;
				}

				const payment = await paymentQueries.store.getPaymentInfoByNumber(
					input.paymentNumber,
				);
				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No payment found",
					});
				}
				if (payment.status === "success") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "ALREADY_PAID",
					});
				}

				const isDev = process.env.NODE_ENV === "development";
				const qpayResponse = await createQpayInvoice(
					isDev ? Math.ceil(payment.amount / 10000) : payment.amount,
					input.paymentNumber,
				);

				const kvPromise = ctx.c.env.vitStoreKV.put(
					`QPAY:${input.paymentNumber}`,
					JSON.stringify(qpayResponse),
					{
						expirationTtl: 3600,
					},
				);
				const dbPromise = paymentQueries.store.changePaymentToQpay(
					input.paymentNumber,
					qpayResponse.invoice_id,
				);
				await Promise.all([kvPromise, dbPromise]);

				return qpayResponse;
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}

				ctx.log.error("payment.create_qr_failed", e, {
					paymentNumber: input.paymentNumber,
				});

				throw new TRPCError({
					code: "BAD_GATEWAY",
					message:
						e instanceof Error ? e.message : "Failed to create QPay invoice",
					cause: e,
				});
			}
		}),
});
