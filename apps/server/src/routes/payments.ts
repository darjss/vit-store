import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
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
    // Route through the canonical confirm + notify + analytics + cache-purge
    // boundary (F2). The webhook is idempotent: if another path already
    // confirmed, confirmPaymentAndNotify returns a non-confirmed reason and we
    // still respond { success: true } to QPay.
    try {
        const result = await confirmPaymentAndNotify({
            paymentNumber,
            provider: "qpay",
            source: "qpay_webhook",
        });
        if (result.confirmed) {
            log.info("qpay.webhook_confirmed", {
                paymentNumber,
                invoiceId: payment.invoiceId,
                qpayPaymentId,
            });
        }
    }
    catch (error) {
        log.error(error instanceof Error ? error : new Error(String(error)), {
            event: "qpay.webhook_confirm_failed",
            paymentNumber,
            invoiceId: payment.invoiceId,
            qpayPaymentId
        });
    }
    return c.json({ success: true });
});
export default app;
