import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { bankTransfer } from "@vit/shared/constants";
import * as v from "valibot";
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
	parseQpayInvoiceResponse,
} from "~/lib/payments/qpay";
import { publicProcedure, router } from "~/lib/trpc";

export const payment = router({
	checkQpayPayment: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				if (payment.status === "success") {
					return { orderNumber: payment.order.orderNumber, paid: true };
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
					referrer: ctx.c.req.header("referer") ?? undefined,
					source: "qpay_checkout",
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
				return { orderNumber: payment.order.orderNumber, paid: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.qpay_check_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to check QPay payment",
				});
			}
		}),
	claimTransferPaid: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = paymentQueries.store;
				await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				const claim = await q.claimTransferPaid(input.paymentNumber);
				ctx.log.info("payment.transfer_claimed", {
					outcome: claim.outcome,
					paymentNumber: input.paymentNumber,
					provider: "transfer",
				});
				const payment = await q.getPaymentByNumber(input.paymentNumber);
				return {
					orderNumber: payment?.order.orderNumber,
					outcome: claim.outcome,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.transfer_claim_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to claim transfer payment",
				});
			}
		}),
	createQr: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<InvoiceResponse> => {
			try {
				const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				if (payment.status === "success") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "ALREADY_PAID",
					});
				}
				const responseFromKv = await kv().get(`QPAY:${input.paymentNumber}`);
				const cachedInvoice = responseFromKv ? parseQpayInvoiceResponse(responseFromKv) : null;
				if (cachedInvoice) {
					await paymentQueries.store.changePaymentToQpay(
						input.paymentNumber,
						cachedInvoice.invoice_id,
					);
					return cachedInvoice;
				}
				const isDev = process.env.NODE_ENV === "development";
				const qpayResponse = await createQpayInvoice(
					isDev ? Math.ceil(payment.amount / 10_000) : payment.amount,
					input.paymentNumber,
				);
				await paymentQueries.store.changePaymentToQpay(
					input.paymentNumber,
					qpayResponse.invoice_id,
				);
				await ctx.c.env.vitStoreKV.put(
					`QPAY:${input.paymentNumber}`,
					JSON.stringify(qpayResponse),
					{
						expirationTtl: 3600,
					},
				);
				trackQpayInvoiceCreatedServerSide({
					paymentNumber: input.paymentNumber,
					phone: payment.order.customerPhone?.toString() ?? input.paymentNumber,
				}).catch(() => {});
				return qpayResponse;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.create_qr_failed",
					paymentNumber: input.paymentNumber,
				});

				// Track QPay invoice failure server-side
				try {
					const paymentInfo = await paymentQueries.store.getPaymentInfoByNumber(
						input.paymentNumber,
					);
					trackQpayInvoiceFailedServerSide({
						errorMessage: error instanceof Error ? error.message : "Failed to create QPay invoice",
						paymentNumber: input.paymentNumber,
						phone: paymentInfo?.order.customerPhone?.toString() ?? input.paymentNumber,
						referrer: ctx.c.req.header("referer") ?? undefined,
					}).catch(() => {});
				} catch {
					// Analytics failure should not break the error response
				}

				throw new TRPCError({
					cause: error,
					code: "BAD_GATEWAY",
					message: error instanceof Error ? error.message : "Failed to create QPay invoice",
				});
			}
		}),
	getPaymentByNumber: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				ctx.log.info("payment.viewed", {
					payment_status: payment.status,
					paymentNumber: input.paymentNumber,
				});
				return {
					createdAt: payment.createdAt,
					order: {
						address: payment.order.address,
						createdAt: payment.order.createdAt,
						customerPhone: `${payment.order.customerPhone}`,
						notes: payment.order.notes,
						orderNumber: payment.order.orderNumber,
						products: payment.order.orderDetails.map((detail) => ({
							brandName: detail.product.brand.name,
							name: detail.product.name,
							productId: detail.product.id,
							// Prefer the price captured on the order line — catalog can drift.
							imageUrl: detail.product.images[0]?.url,
							price: detail.price ?? detail.product.price,
							quantity: detail.quantity,
						})),
						status: payment.order.status,
					},
					paymentNumber: payment.paymentNumber,
					provider: payment.provider,
					status: payment.status,
					total: payment.order.total,
					transferAccount: {
						accountName: ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
						accountNumber: ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
						bankName: bankTransfer.bankName,
					},
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.fetch_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch payment",
				});
			}
		}),
	getPaymentStatus: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				ctx.log.info("payment.status_checked", {
					payment_status: payment.status,
					paymentNumber: input.paymentNumber,
					provider: payment.provider,
				});
				return {
					provider: payment.provider,
					status: payment.status,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.status_check_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get payment status",
				});
			}
		}),
	getTransferReconciliationStatus: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				const reconciler = getTransferReconciliationStub(ctx.c.env, input.paymentNumber);
				return await reconciler.getStatus();
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.transfer_reconciliation_status_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get transfer reconciliation status",
				});
			}
		}),
	selectTransfer: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
				const payment = await paymentQueries.store.getPaymentByNumber(input.paymentNumber);
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
					await paymentQueries.store.changePaymentToTransfer(input.paymentNumber);
					ctx.log.info("payment.provider_selected", {
						paymentNumber: input.paymentNumber,
						provider: "transfer",
					});
				}
				try {
					const reconciler = getTransferReconciliationStub(ctx.c.env, input.paymentNumber);
					await reconciler.start({ paymentNumber: input.paymentNumber });
				} catch (reconciliationError) {
					ctx.log.warn("payment.transfer_reconciliation_start_failed", {
						error:
							reconciliationError instanceof Error
								? reconciliationError.message
								: String(reconciliationError),
						paymentNumber: input.paymentNumber,
					});
				}
				return { provider: "transfer" as const };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.select_transfer_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to select bank transfer",
				});
			}
		}),
	sendTransferNotification: publicProcedure
		.input(
			v.object({
				checkoutToken: v.optional(v.string()),
				paymentNumber: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = paymentQueries.store;
				await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
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

				if (claim.outcome === "changed" || claim.outcome === "already_claimed") {
					if (payment.provider !== "transfer") {
						await q.changePaymentToTransfer(input.paymentNumber);
					}

					try {
						const reconciler = getTransferReconciliationStub(ctx.c.env, input.paymentNumber);
						await reconciler.start({ paymentNumber: input.paymentNumber });
					} catch (reconciliationError) {
						ctx.log.warn("payment.transfer_reconciliation_start_failed", {
							error:
								reconciliationError instanceof Error
									? reconciliationError.message
									: String(reconciliationError),
							paymentNumber: input.paymentNumber,
						});
					}
				}

				try {
					ctx.log.info("payment.notification_sent", {
						amount: payment.amount,
						orderNumber,
						paymentNumber: payment.paymentNumber,
					});
				} catch {
					// Logging failure should not break the claim flow
				}

				return { orderNumber, outcome: claim.outcome };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "payment.notification_failed",
					paymentNumber: input.paymentNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send notification",
				});
			}
		}),
});
