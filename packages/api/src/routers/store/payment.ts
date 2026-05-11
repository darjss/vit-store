import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { sendDetailedOrderNotification, sendTransferNotification, } from "~/lib/integrations/messenger/messages";
import { assertCanAccessPayment } from "~/lib/session/checkout-access";
import { kv } from "~/lib/kv";
import { createQpayInvoice, type InvoiceResponse, } from "~/lib/payments/qpay";
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
            await q.updatePaymentStatus(input.paymentNumber, "customer_claimed_paid");
            await sendTransferNotification(payment.paymentNumber, payment.amount);
            ctx.log.info("payment.notification_sent", {
                paymentNumber: payment.paymentNumber,
                amount: payment.amount,
                orderNumber: payment.order.orderNumber,
            });
            return {
                orderNumber: payment.order.orderNumber,
            };
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
            throw new TRPCError({
                code: "BAD_GATEWAY",
                message: e instanceof Error ? e.message : "Failed to create QPay invoice",
                cause: e,
            });
        }
    }),
});
