import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { checkQpayInvoice, parseQpayInvoiceResponse } from "@vit/api/lib/payments/qpay";
import { paymentQueries } from "@vit/api/queries";
import type { ServerHonoEnv } from "../lib/logging";
import type { Context } from "hono";
import { Hono } from "hono";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
type PaymentContext = Context<ServerHonoEnv>;

async function recoverQpayInvoiceId(
	c: PaymentContext,
	log: PaymentContext["var"]["log"],
	paymentNumber: string,
	qpayPaymentId: string | undefined,
) {
	const cachedValue = await c.env.vitStoreKV.get(`QPAY:${paymentNumber}`);
	const cachedInvoice = cachedValue ? parseQpayInvoiceResponse(cachedValue) : null;
	if (!cachedInvoice) {
		log.warn("qpay.webhook_missing_invoice", {
			paymentNumber,
			qpayCache: cachedValue ? "malformed" : "missing",
			qpayPaymentId,
		});
		return null;
	}
	await paymentQueries.store.storeQpayInvoice(paymentNumber, cachedInvoice.invoice_id);
	log.info("qpay.webhook_invoice_recovered", {
		invoiceId: cachedInvoice.invoice_id,
		paymentNumber,
	});
	return cachedInvoice.invoice_id;
}

async function confirmPaidQpayWebhook(
	log: PaymentContext["var"]["log"],
	invoiceId: string,
	paymentNumber: string,
	qpayPaymentId: string | undefined,
) {
	try {
		const isPaid = await checkQpayInvoice(invoiceId);
		if (!isPaid) {
			return;
		}
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "qpay.webhook_check_failed",
			invoiceId,
			paymentNumber,
			qpayPaymentId,
		});
		return;
	}

	try {
		const result = await confirmPaymentAndNotify({
			paymentNumber,
			provider: "qpay",
			source: "qpay_webhook",
		});
		if (result.confirmed) {
			log.info("qpay.webhook_confirmed", { invoiceId, paymentNumber, qpayPaymentId });
		}
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "qpay.webhook_confirm_failed",
			invoiceId,
			paymentNumber,
			qpayPaymentId,
		});
	}
}

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
	if (!payment || payment.status === "success") {
		if (!payment) {
			log.warn("qpay.webhook_payment_not_found", { paymentNumber, qpayPaymentId });
		}
		return c.json({ success: true });
	}

	let invoiceId = payment.invoiceId;
	if (!invoiceId) {
		try {
			invoiceId = await recoverQpayInvoiceId(c, log, paymentNumber, qpayPaymentId);
			if (!invoiceId) {
				return c.json({ success: true });
			}
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "qpay.webhook_invoice_recovery_failed",
				paymentNumber,
				qpayPaymentId,
			});
			return c.json({ success: true });
		}
	}

	await confirmPaidQpayWebhook(log, invoiceId, paymentNumber, qpayPaymentId);
	return c.json({ success: true });
});
export default app;
