import { checkQpayInvoice } from "@vit/api/lib/payments/qpay";
import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { paymentQueries } from "@vit/api/queries";
import { Hono } from "hono";
import type { ServerHonoEnv } from "../lib/logging";
import { qpayWebhookStatus } from "../lib/payment-webhook-status";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

app.get("/qpay", async (c) => {
	const log = c.get("log");
	log.set({ user_type: "system", operation: "qpay.webhook" });
	const paymentNumber = c.req.query("id");
	const qpayPaymentId = c.req.query("qpay_payment_id");
	if (!paymentNumber) {
		log.warn("qpay.webhook_missing_payment_number", { qpayPaymentId });
		return c.json(
			{ success: false, reason: "missing_payment_number" },
			qpayWebhookStatus({ _tag: "InvalidRequest" }),
		);
	}

	const payment =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment || payment.status === "success" || !payment.invoiceId) {
		return c.json(
			{ success: true },
			qpayWebhookStatus({ _tag: "Acknowledged" }),
		);
	}

	try {
		const checked = await checkQpayInvoice(payment.invoiceId);
		const paid = checked.match({
			ok: (value) => value,
			err: (error) => {
				log.warn("qpay.webhook_check_incomplete", {
					paymentNumber,
					error_tag: error._tag,
				});
				return false;
			},
		});
		if (!paid) {
			return c.json(
				{ success: true },
				qpayWebhookStatus({ _tag: "ProviderAmbiguous" }),
			);
		}

		const confirmation = await confirmPaymentAndNotify({
			paymentNumber,
			provider: "qpay",
			source: "qpay_webhook",
		});
		confirmation.match({
			ok: ({ newlyConfirmed, recoveryPending }) => {
				log.info("qpay.webhook_confirmation_handled", {
					paymentNumber,
					newlyConfirmed,
					recoveryPending,
				});
			},
			err: (error) => {
				log.warn("qpay.webhook_confirmation_rejected", {
					paymentNumber,
					error_tag: error._tag,
				});
			},
		});
	} catch (error) {
		log.error(new Error("QPay webhook processing failed"), {
			event: "qpay.webhook_processing_failed",
			paymentNumber,
			error_name: error instanceof Error ? error.name : "NonErrorFailure",
		});
	}

	return c.json(
		{ success: true },
		qpayWebhookStatus({ _tag: "ProcessingFailed" }),
	);
});

export default app;
