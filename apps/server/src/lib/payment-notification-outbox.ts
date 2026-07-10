import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@vit/api/db/client";
import { PaymentNotificationOutboxTable } from "@vit/api/db/schema";
import { paymentQueries } from "@vit/api/queries";
import { sendOrderConfirmationSms } from "@vit/api/lib/payments/order-confirmation-sms";

const PURPOSE = "order_payment_confirmed_sms";
const BATCH = 10;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;

export async function runPaymentNotificationOutbox() {
	const now = new Date();
	const jobs = await db().select().from(PaymentNotificationOutboxTable).where(and(
		eq(PaymentNotificationOutboxTable.purpose, PURPOSE),
		inArray(PaymentNotificationOutboxTable.status, ["pending", "failed"]),
		lte(PaymentNotificationOutboxTable.nextAttemptAt, now),
	)).limit(BATCH);
	for (const job of jobs) {
		const token = crypto.randomUUID();
		const [claimed] = await db().update(PaymentNotificationOutboxTable).set({ status: "claimed", claimToken: token, claimUntil: new Date(Date.now() + LEASE_MS), attemptCount: sql`${PaymentNotificationOutboxTable.attemptCount} + 1` }).where(and(eq(PaymentNotificationOutboxTable.id, job.id), inArray(PaymentNotificationOutboxTable.status, ["pending", "failed"]))).returning({ id: PaymentNotificationOutboxTable.id });
		if (!claimed) continue;
		const payment = await paymentQueries.store.getPaymentInfoByNumber(job.paymentNumber);
		if (!payment) { await fail(job.id, token, "payment_missing"); continue; }
		try {
			await sendOrderConfirmationSms({ paymentNumber: job.paymentNumber, orderNumber: payment.order.orderNumber, customerPhone: payment.order.customerPhone, total: payment.order.total });
			await db().update(PaymentNotificationOutboxTable).set({ status: "sent", claimToken: null, claimUntil: null }).where(and(eq(PaymentNotificationOutboxTable.id, job.id), eq(PaymentNotificationOutboxTable.claimToken, token)));
		} catch (error) {
			if (error instanceof Error && error.message.includes("STORE_PUBLIC_URL")) { await fail(job.id, token, "store_url_invalid"); continue; }
			// Gateway has no idempotency key: acceptance may have happened before failure.
			await db().update(PaymentNotificationOutboxTable).set({ status: "unknown", lastErrorCode: "provider_ambiguous", lastErrorAt: new Date() }).where(and(eq(PaymentNotificationOutboxTable.id, job.id), eq(PaymentNotificationOutboxTable.claimToken, token)));
		}
	}
}
async function fail(id: number, token: string, code: string) {
	await db().update(PaymentNotificationOutboxTable).set({ status: "failed", claimToken: null, claimUntil: null, lastErrorCode: code, lastErrorAt: new Date(), nextAttemptAt: new Date(Date.now() + 60_000) }).where(and(eq(PaymentNotificationOutboxTable.id, id), eq(PaymentNotificationOutboxTable.claimToken, token)));
}
