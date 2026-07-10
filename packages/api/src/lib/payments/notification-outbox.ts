import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "~/db/client";
import {
	PaymentNotificationAttemptsTable,
	PaymentNotificationOutboxTable,
} from "~/db/schema";
import {
	SmsAmbiguousError,
	SmsRetryableError,
	sendOrderConfirmationSms,
} from "~/lib/payments/order-confirmation-sms";
import { paymentQueries } from "~/queries";

const PURPOSE = "order_payment_confirmed_sms";
const BATCH = 10;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;

export async function runPaymentNotificationOutbox() {
	let claimedCount = 0;
	for (let page = 0; page < 10; page += 1) {
		const jobs = await claimDueJobs();
		if (jobs.length === 0) break;
		claimedCount += jobs.length;
		for (const job of jobs) await deliver(job);
		if (jobs.length < BATCH) break;
	}
	return { claimedCount };
}

async function claimDueJobs() {
	const now = new Date();
	const candidates = await db()
		.select()
		.from(PaymentNotificationOutboxTable)
		.where(
			and(
				eq(PaymentNotificationOutboxTable.purpose, PURPOSE),
				or(
					and(
						inArray(PaymentNotificationOutboxTable.status, [
							"pending",
							"failed",
						]),
						lte(PaymentNotificationOutboxTable.nextAttemptAt, now),
						sql`${PaymentNotificationOutboxTable.attemptCount} < ${MAX_ATTEMPTS}`,
					),
					and(
						eq(PaymentNotificationOutboxTable.status, "claimed"),
						lte(PaymentNotificationOutboxTable.claimUntil, now),
					),
				),
			),
		)
		.limit(BATCH);
	const jobs: {
		id: number;
		paymentNumber: string;
		token: string;
		attemptNumber: number;
	}[] = [];
	for (const candidate of candidates) {
		const token = crypto.randomUUID();
		const [claimed] = await db()
			.update(PaymentNotificationOutboxTable)
			.set({
				status: "claimed",
				claimToken: token,
				claimUntil: new Date(Date.now() + LEASE_MS),
				attemptCount: sql`${PaymentNotificationOutboxTable.attemptCount} + 1`,
			})
			.where(
				and(
					eq(PaymentNotificationOutboxTable.id, candidate.id),
					or(
						and(
							inArray(PaymentNotificationOutboxTable.status, [
								"pending",
								"failed",
							]),
							lte(PaymentNotificationOutboxTable.nextAttemptAt, now),
							sql`${PaymentNotificationOutboxTable.attemptCount} < ${MAX_ATTEMPTS}`,
						),
						and(
							eq(PaymentNotificationOutboxTable.status, "claimed"),
							lte(PaymentNotificationOutboxTable.claimUntil, now),
						),
					),
				),
			)
			.returning({
				id: PaymentNotificationOutboxTable.id,
				paymentNumber: PaymentNotificationOutboxTable.paymentNumber,
				attemptCount: PaymentNotificationOutboxTable.attemptCount,
			});
		if (!claimed) continue;
		await db().insert(PaymentNotificationAttemptsTable).values({
			outboxId: claimed.id,
			attemptNumber: claimed.attemptCount,
			outcome: "claimed",
		});
		jobs.push({
			id: claimed.id,
			paymentNumber: claimed.paymentNumber,
			token,
			attemptNumber: claimed.attemptCount,
		});
	}
	return jobs;
}

async function deliver(job: {
	id: number;
	paymentNumber: string;
	token: string;
	attemptNumber: number;
}) {
	const payment = await paymentQueries.store.getPaymentInfoByNumber(
		job.paymentNumber,
	);
	if (!payment) return retry(job, "payment_missing");
	try {
		await sendOrderConfirmationSms({
			paymentNumber: job.paymentNumber,
			orderNumber: payment.order.orderNumber,
			customerPhone: payment.order.customerPhone,
			total: payment.order.total,
		});
		await finish(job, "sent");
	} catch (error) {
		if (error instanceof SmsAmbiguousError)
			return finish(job, "unknown", "provider_ambiguous");
		const code =
			error instanceof SmsRetryableError ? error.code : "store_url_invalid";
		return retry(job, code);
	}
}

async function finish(
	job: { id: number; token: string; attemptNumber: number },
	status: "sent" | "unknown",
	errorCode?: string,
) {
	const [updated] = await db()
		.update(PaymentNotificationOutboxTable)
		.set({
			status,
			claimToken: null,
			claimUntil: null,
			lastErrorCode: errorCode ?? null,
			lastErrorAt: errorCode ? new Date() : null,
		})
		.where(
			and(
				eq(PaymentNotificationOutboxTable.id, job.id),
				eq(PaymentNotificationOutboxTable.status, "claimed"),
				eq(PaymentNotificationOutboxTable.claimToken, job.token),
			),
		)
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated)
		await db()
			.update(PaymentNotificationAttemptsTable)
			.set({ outcome: status, errorCode: errorCode ?? null })
			.where(
				and(
					eq(PaymentNotificationAttemptsTable.outboxId, job.id),
					eq(PaymentNotificationAttemptsTable.attemptNumber, job.attemptNumber),
				),
			);
}

async function retry(
	job: { id: number; token: string; attemptNumber: number },
	code: string,
) {
	const terminal = job.attemptNumber >= MAX_ATTEMPTS;
	const [updated] = await db()
		.update(PaymentNotificationOutboxTable)
		.set({
			status: terminal ? "unknown" : "failed",
			claimToken: null,
			claimUntil: null,
			lastErrorCode: code,
			lastErrorAt: new Date(),
			nextAttemptAt: new Date(
				Date.now() + Math.min(60_000 * 2 ** (job.attemptNumber - 1), 3_600_000),
			),
		})
		.where(
			and(
				eq(PaymentNotificationOutboxTable.id, job.id),
				eq(PaymentNotificationOutboxTable.status, "claimed"),
				eq(PaymentNotificationOutboxTable.claimToken, job.token),
			),
		)
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated)
		await db()
			.update(PaymentNotificationAttemptsTable)
			.set({ outcome: terminal ? "exhausted" : "failed", errorCode: code })
			.where(
				and(
					eq(PaymentNotificationAttemptsTable.outboxId, job.id),
					eq(PaymentNotificationAttemptsTable.attemptNumber, job.attemptNumber),
				),
			);
}
