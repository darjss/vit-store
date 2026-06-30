import { persistMessengerNotificationFailure } from "@vit/api/lib/integrations/messenger/failed-notifications";
import { sendDetailedOrderNotification } from "@vit/api/lib/integrations/messenger/messages";
import { trackOrderPlacedServerSide, trackPaymentConfirmedServerSide } from "@vit/api/lib/integrations/posthog/capture";
import { checkQpayInvoice } from "@vit/api/lib/payments/qpay";
import { paymentQueries } from "@vit/api/queries";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
const app = new Hono<ServerHonoEnv>();
app.get("/qpay", async (c) => {
    const log = c.get("log");
    log.set({ user_type: "system", operation: "qpay.webhook" });
    const paymentNumber = c.req.query("id");
    const qpayPaymentId = c.req.query("qpay_payment_id");
    if (!paymentNumber) {
        log.warn("qpay.webhook_missing_payment_number", { qpayPaymentId });
        return c.json({ success: false, reason: "missing_payment_number" }, 400);
    }
    log.info("qpay.webhook_received", { paymentNumber, qpayPaymentId });
    const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
    if (!payment) {
        log.warn("qpay.webhook_payment_not_found", {
            paymentNumber,
            qpayPaymentId,
        });
        return c.json({ success: true });
    }
    if (payment.status === "success") {
        return c.json({ success: true });
    }
    if (!payment.invoiceId) {
        log.warn("qpay.webhook_missing_invoice", { paymentNumber, qpayPaymentId });
        return c.json({ success: true });
    }
    try {
        const isPaid = await checkQpayInvoice(payment.invoiceId);
        if (!isPaid) {
            return c.json({ success: true });
        }
    }
    catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
            event: "qpay.webhook_check_failed",
            paymentNumber,
            invoiceId: payment.invoiceId,
            qpayPaymentId
        });
        return c.json({ success: true });
    }
    let confirmed = false;
    try {
        confirmed = await paymentQueries.store.confirmPaymentIfPending(paymentNumber, "qpay");
    }
    catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
            event: "qpay.webhook_confirm_failed",
            paymentNumber,
            invoiceId: payment.invoiceId,
            qpayPaymentId
        });
        return c.json({ success: true });
    }
    if (!confirmed) {
        return c.json({ success: true });
    }
    const notificationPayload = {
        paymentNumber,
        customerPhone: payment.order.customerPhone,
        address: payment.order.address,
        notes: payment.order.notes,
        total: payment.order.total,
        products: payment.order.orderDetails.map((detail) => ({
            name: detail.product.name,
            quantity: detail.quantity,
            price: detail.product.price,
            imageUrl: detail.product.images[0]?.url,
        })),
        status: "payment_confirmed" as const,
    };
    try {
        await sendDetailedOrderNotification(notificationPayload);
    }
    catch (error) {
        await persistMessengerNotificationFailure({
            paymentNumber,
            payload: notificationPayload,
            error,
        });
        log.warn("qpay.webhook_confirm_notification_queued_for_retry", {
            paymentNumber,
            invoiceId: payment.invoiceId,
            qpayPaymentId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    trackPaymentConfirmedServerSide({
        phone: payment.order.customerPhone?.toString() ?? paymentNumber,
        paymentNumber,
        orderNumber: payment.order.orderNumber,
        provider: "qpay",
        revenue: payment.order.total,
    }).catch(() => {});
    trackOrderPlacedServerSide({
        phone: payment.order.customerPhone?.toString() ?? paymentNumber,
        orderNumber: payment.order.orderNumber,
        paymentNumber,
        total: payment.order.total,
        provider: "qpay",
    }).catch(() => {});

    log.info("qpay.webhook_confirmed", {
        paymentNumber,
        invoiceId: payment.invoiceId,
        qpayPaymentId,
    });
    return c.json({ success: true });
});
export default app;
