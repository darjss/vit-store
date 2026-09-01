import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { checkQpayInvoice, parseQpayInvoiceResponse } from "@vit/api/lib/payments/qpay";
import { paymentQueries } from "@vit/api/queries";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
app.get("/qpay", async (c) => {
	const log = c.get("log");
	log.set({ operation: "qpay.webhook", user_type: "system" });
	const paymentNumber = c.req.query("id");
	const qpayPaymentId = c.req.query("qpay_payment_id");
	if (!paymentNumber) {
		log.warn("qpay.webhook_missing_payment_number", { qpayPaymentId });
		return c.json({ reason: "missing_payment_number", success: false }, 400);
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
	let invoiceId = payment.invoiceId;
	if (!invoiceId) {
		try {
			const cachedValue = await c.env.vitStoreKV.get(`QPAY:${paymentNumber}`);
			const cachedInvoice = cachedValue ? parseQpayInvoiceResponse(cachedValue) : null;
			if (!cachedInvoice) {
				log.warn("qpay.webhook_missing_invoice", {
					paymentNumber,
					qpayCache: cachedValue ? "malformed" : "missing",
					qpayPaymentId,
				});
				return c.json({ success: true });
			}
			invoiceId = cachedInvoice.invoice_id;
			await paymentQueries.store.storeQpayInvoice(paymentNumber, invoiceId);
			log.info("qpay.webhook_invoice_recovered", {
				invoiceId,
				paymentNumber,
			});
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "qpay.webhook_invoice_recovery_failed",
				paymentNumber,
				qpayPaymentId,
			});
			return c.json({ success: true });
		}
	}
	try {
		const isPaid = await checkQpayInvoice(invoiceId);
		if (!isPaid) {
			return c.json({ success: true });
		}
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "qpay.webhook_check_failed",
			invoiceId,
			paymentNumber,
			qpayPaymentId,
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
				invoiceId,
				paymentNumber,
				qpayPaymentId,
			});
		}
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "qpay.webhook_confirm_failed",
			invoiceId,
			paymentNumber,
			qpayPaymentId,
		});
	}
	return c.json({ success: true });
});
export default app;
