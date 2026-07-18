import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { bankTransfer } from "@vit/shared/constants";
import * as v from "valibot";
import { sendTransferClaimedNotification } from "~/lib/integrations/messenger/messages";
import {
	trackQpayInvoiceCreatedServerSide,
	trackQpayInvoiceFailedServerSide,
} from "~/lib/integrations/posthog";
import { assertCanAccessPayment } from "~/lib/session/checkout-access";
import { getTransferReconciliationStub } from "~/lib/durable-objects";
import { kv } from "~/lib/kv";
import {
	checkQpayInvoice,
	createQpayInvoice,
	type InvoiceResponse,
} from "~/lib/payments/qpay";
import { publicProcedure, router } from "~/lib/trpc";

async function sendTransferClaimAlert(paymentNumber: string) {
	const paymentInfo =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!paymentInfo) return;
	await sendTransferClaimedNotification({
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
	});
}

export const payment = router({
	getPaymentByNumber: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const payment = await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				ctx.log.info("payment.viewed", {
					paymentNumber: input.paymentNumber,
					payment_status: payment.status,
				});
				return {
					paymentNumber: payment.paymentNumber,
					status: payment.status,
					provider: payment.provider,
					createdAt: payment.createdAt,
					total: payment.order.total,
					transferAccount: {
						bankName: bankTransfer.bankName,
						accountNumber:
							ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
						accountName:
							ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
					},
					order: {
						orderNumber: payment.order.orderNumber,
						customerPhone: `${payment.order.customerPhone}`,
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
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.fetch_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch payment",
					cause: e,
				});
			}
		}),
	claimTransferPaid: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const q = paymentQueries.store;
				await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				const claim = await q.claimTransferPaid(input.paymentNumber);
				if (claim.outcome === "changed") {
					try {
						await sendTransferClaimAlert(input.paymentNumber);
					} catch (notificationError) {
						ctx.log.error(
							notificationError instanceof Error
								? notificationError
								: new Error(String(notificationError)),
							{
								event: "payment.claim_notification_failed",
								paymentNumber: input.paymentNumber,
							},
						);
					}
				}
				ctx.log.info("payment.transfer_claimed", {
					paymentNumber: input.paymentNumber,
					provider: "transfer",
					outcome: claim.outcome,
				});
				const payment = await q.getPaymentByNumber(input.paymentNumber);
				return {
					orderNumber: payment?.order.orderNumber,
					outcome: claim.outcome,
				};
			} catch (e) {
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.confirm_failed",
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
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const q = paymentQueries.store;
				await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
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

				const orderNumber = payment.order.orderNumber;
				const claim = await q.claimTransferPaid(input.paymentNumber);

				if (claim.outcome === "refused") {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Failed payments cannot be claimed",
					});
				}

				if (
					claim.outcome === "changed" ||
					claim.outcome === "already_claimed"
				) {
					if (payment.provider !== "transfer") {
						await q.changePaymentToTransfer(input.paymentNumber);
					}

					try {
						const reconciler = getTransferReconciliationStub(
							ctx.c.env,
							input.paymentNumber,
						);
						await reconciler.start({ paymentNumber: input.paymentNumber });
					} catch (reconciliationError) {
						ctx.log.warn("payment.transfer_reconciliation_start_failed", {
							paymentNumber: input.paymentNumber,
							error:
								reconciliationError instanceof Error
									? reconciliationError.message
									: String(reconciliationError),
						});
					}
				}

				if (claim.outcome === "changed") {
					try {
						await sendTransferClaimAlert(input.paymentNumber);
					} catch (notificationError) {
						ctx.log.error(
							notificationError instanceof Error
								? notificationError
								: new Error(String(notificationError)),
							{
								event: "payment.transfer_notification_failed",
								paymentNumber: input.paymentNumber,
							},
						);
					}
				}

				try {
					ctx.log.info("payment.notification_sent", {
						paymentNumber: payment.paymentNumber,
						amount: payment.amount,
						orderNumber,
					});
				} catch {
					// Logging failure should not break the claim flow
				}

				return { orderNumber, outcome: claim.outcome };
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.notification_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send notification",
					cause: e,
				});
			}
		}),
	getTransferReconciliationStatus: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				const reconciler = getTransferReconciliationStub(
					ctx.c.env,
					input.paymentNumber,
				);
				return await reconciler.getStatus();
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.transfer_reconciliation_status_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get transfer reconciliation status",
					cause: e,
				});
			}
		}),
	getPaymentStatus: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				const payment = await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				ctx.log.info("payment.status_checked", {
					paymentNumber: input.paymentNumber,
					payment_status: payment.status,
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
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.status_check_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get payment status",
					cause: e,
				});
			}
		}),
	selectTransfer: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				const payment = await paymentQueries.store.getPaymentByNumber(
					input.paymentNumber,
				);
				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				if (payment.status === "success") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "ALREADY_PAID",
					});
				}
				if (payment.provider !== "transfer") {
					await paymentQueries.store.changePaymentToTransfer(
						input.paymentNumber,
					);
					ctx.log.info("payment.provider_selected", {
						paymentNumber: input.paymentNumber,
						provider: "transfer",
					});
				}
				try {
					const reconciler = getTransferReconciliationStub(
						ctx.c.env,
						input.paymentNumber,
					);
					await reconciler.start({ paymentNumber: input.paymentNumber });
				} catch (reconciliationError) {
					ctx.log.warn("payment.transfer_reconciliation_start_failed", {
						paymentNumber: input.paymentNumber,
						error:
							reconciliationError instanceof Error
								? reconciliationError.message
								: String(reconciliationError),
					});
				}
				return { provider: "transfer" as const };
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.select_transfer_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to select bank transfer",
					cause: e,
				});
			}
		}),
	createQr: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.mutation(async ({ input, ctx }): Promise<InvoiceResponse> => {
			try {
				await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
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
				trackQpayInvoiceCreatedServerSide({
					phone: payment.order.customerPhone?.toString() ?? input.paymentNumber,
					paymentNumber: input.paymentNumber,
				}).catch(() => {});
				return qpayResponse;
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.create_qr_failed",
					paymentNumber: input.paymentNumber,
				});

				// Track QPay invoice failure server-side
				try {
					const paymentInfo = await paymentQueries.store.getPaymentInfoByNumber(
						input.paymentNumber,
					);
					trackQpayInvoiceFailedServerSide({
						phone:
							paymentInfo?.order.customerPhone?.toString() ??
							input.paymentNumber,
						paymentNumber: input.paymentNumber,
						errorMessage:
							e instanceof Error ? e.message : "Failed to create QPay invoice",
						referrer: ctx.c.req.header("referer") ?? undefined,
					}).catch(() => {});
				} catch {
					// Analytics failure should not break the error response
				}

				throw new TRPCError({
					code: "BAD_GATEWAY",
					message:
						e instanceof Error ? e.message : "Failed to create QPay invoice",
					cause: e,
				});
			}
		}),
	checkQpayPayment: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				checkoutToken: v.optional(v.string()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const payment = await assertCanAccessPayment(
					ctx,
					input.paymentNumber,
					input.checkoutToken,
				);
				if (payment.status === "success") {
					return { paid: true, orderNumber: payment.order.orderNumber };
				}
				if (payment.provider !== "qpay" || !payment.invoiceId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Not a QPay payment",
					});
				}
				const isPaid = await checkQpayInvoice(payment.invoiceId);
				if (!isPaid) {
					return { paid: false };
				}
				// Route through the canonical confirm + notify + analytics +
				// cache-purge boundary (F2).
				const result = await confirmPaymentAndNotify({
					paymentNumber: input.paymentNumber,
					provider: "qpay",
					source: "qpay_checkout",
					referrer: ctx.c.req.header("referer") ?? undefined,
				});
				if (!result.confirmed) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Payment already confirmed or not pending",
					});
				}

				ctx.log.info("payment.qpay_confirmed", {
					paymentNumber: input.paymentNumber,
					provider: "qpay",
				});
				return { paid: true, orderNumber: payment.order.orderNumber };
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
					event: "payment.qpay_check_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to check QPay payment",
					cause: e,
				});
			}
		}),
});
