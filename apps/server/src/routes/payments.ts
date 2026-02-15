import { sendDetailedOrderNotification } from "@vit/api/lib/integrations/messenger/messages";
import { checkQpayInvoice } from "@vit/api/lib/payments/qpay";
import { paymentQueries } from "@vit/api/queries";
import { createLogger, createRequestContext } from "@vit/logger";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/qpay", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "system" });
	const log = createLogger(logContext);
	const paymentNumber = c.req.query("id");
	const qpayPaymentId = c.req.query("qpay_payment_id");

	if (!paymentNumber) {
		log.warn("qpay.webhook_missing_payment_number", { qpayPaymentId });
		return c.json({ success: false, reason: "missing_payment_number" }, 400);
	}

	log.info("qpay.webhook_received", { paymentNumber, qpayPaymentId });

	const payment =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
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
	} catch (error) {
		log.error("qpay.webhook_check_failed", error, {
			paymentNumber,
			invoiceId: payment.invoiceId,
			qpayPaymentId,
		});
		return c.json({ success: true });
	}

	const confirmed = await paymentQueries.store.confirmPaymentIfPending(
		paymentNumber,
		"qpay",
	);

	if (!confirmed) {
		return c.json({ success: true });
	}

	try {
		await sendDetailedOrderNotification({
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
			status: "payment_confirmed",
		});
	} catch (error) {
		log.error("qpay.webhook_confirm_notification_failed", error, {
			paymentNumber,
			invoiceId: payment.invoiceId,
			qpayPaymentId,
		});
	}

	log.info("qpay.webhook_confirmed", {
		paymentNumber,
		invoiceId: payment.invoiceId,
		qpayPaymentId,
	});

	return c.json({ success: true });
});

export default app;
