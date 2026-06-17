import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { persistMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
import { sendDetailedOrderNotification, sendTransferClaimedNotification } from "~/lib/integrations/messenger/messages";
import {
	trackPaymentConfirmedServerSide,
	trackQpayInvoiceFailedServerSide,
} from "~/lib/integrations/posthog";
import { assertCanAccessPayment } from "~/lib/session/checkout-access";
import { kv } from "~/lib/kv";
import { checkQpayInvoice, createQpayInvoice, type InvoiceResponse, } from "~/lib/payments/qpay";
import { publicProcedure, router } from "~/lib/trpc";
export const payment = router({
    getPaymentByNumber: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .query(async ({ ctx, input }) => {
        try {
            const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
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
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "payment.fetch_failed",
                paymentNumber: input.paymentNumber
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch payment",
                cause: e,
            });
        }
    }),
    claimTransferPaid: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .mutation(async ({ input, ctx }) => {
        try {
            const q = paymentQueries.store;
            await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
            await q.updatePaymentStatus(input.paymentNumber, "customer_claimed_paid");
            try {
                const paymentInfo = await q.getPaymentInfoByNumber(input.paymentNumber);
                if (paymentInfo) {
                    await sendTransferClaimedNotification({
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
                    });
                }
            }
            catch (notificationError) {
                ctx.log.error(notificationError instanceof Error ? notificationError : new Error(String(notificationError)), {
                    event: "payment.confirm_notification_failed",
                    paymentNumber: input.paymentNumber
                });
            }
            ctx.log.info("payment.confirmed", {
                paymentNumber: input.paymentNumber,
                provider: "transfer",
            });
            const payment = await q.getPaymentByNumber(input.paymentNumber);
            return { orderNumber: payment?.order.orderNumber };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "payment.confirm_failed",
                paymentNumber: input.paymentNumber
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to confirm payment",
                cause: e,
            });
        }
    }),
    sendTransferNotification: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .mutation(async ({ input, ctx }) => {
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

            if (payment.provider !== "transfer") {
                await q.changePaymentToTransfer(input.paymentNumber);
            }

            if (payment.status !== "customer_claimed_paid") {
                await q.updatePaymentStatus(input.paymentNumber, "customer_claimed_paid");
            }

            try {
                const paymentInfo = await q.getPaymentInfoByNumber(input.paymentNumber);
                if (paymentInfo) {
                    await sendTransferClaimedNotification({
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
                    });
                }
            }
            catch (notificationError) {
                ctx.log.error(notificationError instanceof Error ? notificationError : new Error(String(notificationError)), {
                    event: "payment.transfer_notification_failed",
                    paymentNumber: input.paymentNumber,
                });
            }

            try {
                ctx.log.info("payment.notification_sent", {
                    paymentNumber: payment.paymentNumber,
                    amount: payment.amount,
                    orderNumber,
                });
            }
            catch {
                // Logging failure should not break the claim flow
            }

            return { orderNumber };
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "payment.notification_failed",
                paymentNumber: input.paymentNumber
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to send notification",
                cause: e,
            });
        }
    }),
    getPaymentStatus: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .query(async ({ input, ctx }) => {
        try {
            const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
            ctx.log.info("payment.status_checked", {
                paymentNumber: input.paymentNumber,
                payment_status: payment.status,
                provider: payment.provider,
            });
            return {
                status: payment.status,
                provider: payment.provider,
            };
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "payment.status_check_failed",
                paymentNumber: input.paymentNumber
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get payment status",
                cause: e,
            });
        }
    }),
    selectTransfer: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .mutation(async ({ input, ctx }) => {
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
            return { provider: "transfer" as const };
        }
        catch (e) {
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
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .mutation(async ({ input, ctx }): Promise<InvoiceResponse> => {
        try {
            await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
            const responseFromKv = await kv().get(`QPAY:${input.paymentNumber}`);
            if (responseFromKv) {
                return JSON.parse(responseFromKv) as InvoiceResponse;
            }
            const payment = await paymentQueries.store.getPaymentInfoByNumber(input.paymentNumber);
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
            const qpayResponse = await createQpayInvoice(isDev ? Math.ceil(payment.amount / 10000) : payment.amount, input.paymentNumber);
            const kvPromise = ctx.c.env.vitStoreKV.put(`QPAY:${input.paymentNumber}`, JSON.stringify(qpayResponse), {
                expirationTtl: 3600,
            });
            const dbPromise = paymentQueries.store.changePaymentToQpay(input.paymentNumber, qpayResponse.invoice_id);
            await Promise.all([kvPromise, dbPromise]);
            return qpayResponse;
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "payment.create_qr_failed",
                paymentNumber: input.paymentNumber
            });

            // Track QPay invoice failure server-side
            try {
                const paymentInfo = await paymentQueries.store.getPaymentInfoByNumber(input.paymentNumber);
                trackQpayInvoiceFailedServerSide({
                    phone: paymentInfo?.order.customerPhone?.toString() ?? input.paymentNumber,
                    paymentNumber: input.paymentNumber,
                    errorMessage: e instanceof Error ? e.message : "Failed to create QPay invoice",
                    referrer: ctx.c.req.header("referer") ?? undefined,
                }).catch(() => {});
            } catch {
                // Analytics failure should not break the error response
            }

            throw new TRPCError({
                code: "BAD_GATEWAY",
                message: e instanceof Error ? e.message : "Failed to create QPay invoice",
                cause: e,
            });
        }
    }),
    checkQpayPayment: publicProcedure
        .input(v.object({ paymentNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .mutation(async ({ input, ctx }) => {
        try {
            const q = paymentQueries.store;
            const payment = await assertCanAccessPayment(ctx, input.paymentNumber, input.checkoutToken);
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
            const confirmed = await q.confirmPaymentAndApplyStock(input.paymentNumber, "qpay");
            if (!confirmed) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Payment already confirmed or not pending",
                });
            }
            try {
                const paymentInfo = await q.getPaymentInfoByNumber(input.paymentNumber);
                if (paymentInfo) {
                    const notificationPayload = {
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
                        status: "payment_confirmed" as const,
                    };
                    try {
                        await sendDetailedOrderNotification(notificationPayload);
                    } catch (notificationError) {
                        await persistMessengerNotificationFailure({
                            paymentNumber: input.paymentNumber,
                            payload: notificationPayload,
                            error: notificationError,
                        });
                        ctx.log.warn("payment.qpay_notification_queued_for_retry", {
                            paymentNumber: input.paymentNumber,
                            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
                        });
                    }
                }
            }
            catch (notificationError) {
                ctx.log.error(notificationError instanceof Error ? notificationError : new Error(String(notificationError)), {
                    event: "payment.qpay_notification_failed",
                    paymentNumber: input.paymentNumber,
                });
            }
            try {
                await trackPaymentConfirmedServerSide({
                    phone: payment.order.customerPhone?.toString() ?? input.paymentNumber,
                    paymentNumber: input.paymentNumber,
                    orderNumber: payment.order.orderNumber,
                    provider: "qpay",
                    revenue: payment.order.total,
                    referrer: ctx.c.req.header("referer") ?? undefined,
                });
            } catch {
                // Analytics failure should not break the payment flow
            }

            ctx.log.info("payment.qpay_confirmed", {
                paymentNumber: input.paymentNumber,
                provider: "qpay",
            });
            return { paid: true, orderNumber: payment.order.orderNumber };
        }
        catch (e) {
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
