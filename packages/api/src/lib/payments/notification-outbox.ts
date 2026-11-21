import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "~/db/client";
import {
	OrdersTable,
	PaymentNotificationAttemptsTable,
	PaymentNotificationOutboxTable,
} from "~/db/schema";
import { createPayLink, isAwaitingPayment } from "~/lib/payments/pay-link";
import {
	buildOrderConfirmationSmsMessage,
	buildUnpaidReminderSmsMessage,
	isMongolianMobile,
	SmsAmbiguousError,
	SmsRetryableError,
	sendPaymentSms,
} from "~/lib/payments/payment-sms";
import type { TransactionType } from "~/lib/types";
import { paymentQueries } from "~/queries";

const CONFIRMED_SMS = "order_payment_confirmed_sms";
const UNPAID_REMINDER_SMS = "order_unpaid_reminder_sms";
const PURPOSES = [CONFIRMED_SMS, UNPAID_REMINDER_SMS];
const BATCH = 10;
// sendSmsAndWait makes at most 34 gateway requests of up to 10s, 32 of them 1s apart.
const LEASE_MS = 420_000;
const MAX_ATTEMPTS = 5;

const UNPAID_REMINDER_DELAY_MS = 20 * 60_000;
// Matches the pay link's 48 hour life.
const UNPAID_REMINDER_MAX_AGE_MS = 48 * 3_600_000;
const ULAANBAATAR_OFFSET_MS = 8 * 3_600_000;
const QUIET_END_HOUR = 9;
const QUIET_START_HOUR = 22;

type ClaimedJob = {
	attemptNumber: number;
	id: number;
	paymentNumber: string;
	purpose: string;
	token: string;
};

type PaymentInfo = NonNullable<
	Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
>;

/** `at`, or 09:00 Ulaanbaatar time when `at` falls between 22:00 and 09:00 there. */
export function outsideQuietHours(at: Date) {
	const local = new Date(at.getTime() + ULAANBAATAR_OFFSET_MS);
	const hour = local.getUTCHours();
	if (hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR) {
		return at;
	}
	if (hour >= QUIET_START_HOUR) {
		local.setUTCDate(local.getUTCDate() + 1);
	}
	local.setUTCHours(QUIET_END_HOUR, 0, 0, 0);
	return new Date(local.getTime() - ULAANBAATAR_OFFSET_MS);
}

/** Queues the one unpaid-order SMS for a storefront order, 20 minutes out. */
export async function enqueueUnpaidReminder(tx: TransactionType, paymentNumber: string) {
	await tx
		.insert(PaymentNotificationOutboxTable)
		.values({
			nextAttemptAt: outsideQuietHours(new Date(Date.now() + UNPAID_REMINDER_DELAY_MS)),
			paymentNumber,
			purpose: UNPAID_REMINDER_SMS,
		})
		.onConflictDoNothing();
}

export async function runPaymentNotificationOutbox() {
	let claimedCount = 0;
	for (let processed = 0; processed < BATCH * 10; processed += 1) {
		const candidate = await findDueJob();
		if (!candidate) {
			break;
		}
		const payment = await paymentQueries.store.getPaymentInfoByNumber(candidate.paymentNumber);
		const job = await claimJob(candidate.id);
		if (!job) {
			continue;
		}
		claimedCount += 1;
		if (!payment) {
			await retry(job, "payment_missing");
		} else {
			await deliver(job, payment);
		}
	}
	return { claimedCount };
}

function dueWhere(now: Date) {
	return or(
		and(
			inArray(PaymentNotificationOutboxTable.status, ["pending", "failed"]),
			lte(PaymentNotificationOutboxTable.nextAttemptAt, now),
			sql`${PaymentNotificationOutboxTable.attemptCount} < ${MAX_ATTEMPTS}`,
		),
		and(
			eq(PaymentNotificationOutboxTable.status, "claimed"),
			lte(PaymentNotificationOutboxTable.claimUntil, now),
		),
	);
}

async function findDueJob() {
	const jobs = await db()
		.select()
		.from(PaymentNotificationOutboxTable)
		.where(and(inArray(PaymentNotificationOutboxTable.purpose, PURPOSES), dueWhere(new Date())))
		.limit(1);
	return jobs[0];
}

async function claimJob(id: number): Promise<ClaimedJob | undefined> {
	return db().transaction(async (tx) => {
		const token = crypto.randomUUID();
		const [claimed] = await tx
			.update(PaymentNotificationOutboxTable)
			.set({
				attemptCount: sql`${PaymentNotificationOutboxTable.attemptCount} + 1`,
				claimToken: token,
				claimUntil: new Date(Date.now() + LEASE_MS),
				status: "claimed",
			})
			.where(and(eq(PaymentNotificationOutboxTable.id, id), dueWhere(new Date())))
			.returning({
				attemptCount: PaymentNotificationOutboxTable.attemptCount,
				id: PaymentNotificationOutboxTable.id,
				paymentNumber: PaymentNotificationOutboxTable.paymentNumber,
				purpose: PaymentNotificationOutboxTable.purpose,
			});
		if (!claimed) {
			return;
		}
		await tx.insert(PaymentNotificationAttemptsTable).values({
			attemptNumber: claimed.attemptCount,
			outboxId: claimed.id,
			outcome: "claimed",
		});
		return { ...claimed, attemptNumber: claimed.attemptCount, token };
	});
}

async function deliver(job: ClaimedJob, payment: PaymentInfo) {
	if (!(await ownsLease(job))) {
		return;
	}
	if (job.purpose === UNPAID_REMINDER_SMS) {
		// Retries and a late cron tick can land in quiet hours too.
		const sendAt = outsideQuietHours(new Date());
		if (sendAt.getTime() > Date.now()) {
			return defer(job, sendAt);
		}
		const skipReason = await unpaidReminderSkipReason(payment);
		if (skipReason) {
			return finish(job, "skipped", skipReason);
		}
	}
	try {
		const message =
			job.purpose === UNPAID_REMINDER_SMS
				? buildUnpaidReminderSmsMessage(await createPayLink(job.paymentNumber))
				: buildOrderConfirmationSmsMessage(payment.order);
		await sendPaymentSms({
			customerPhone: payment.order.customerPhone,
			event:
				job.purpose === UNPAID_REMINDER_SMS
					? "order.sms_unpaid_reminder_sent"
					: "order.sms_confirmation_sent",
			message,
			orderNumber: payment.order.orderNumber,
			paymentNumber: job.paymentNumber,
		});
		await finish(job, "sent");
	} catch (error) {
		if (error instanceof SmsAmbiguousError) {
			return finish(job, "unknown", "provider_ambiguous");
		}
		return retry(job, error instanceof SmsRetryableError ? error.code : "unexpected_error");
	}
}

async function unpaidReminderSkipReason(payment: PaymentInfo) {
	if (!isAwaitingPayment(payment)) {
		return "not_pending";
	}
	if (!isMongolianMobile(payment.order.customerPhone)) {
		return "invalid_phone";
	}
	if (Date.now() - payment.order.createdAt.getTime() > UNPAID_REMINDER_MAX_AGE_MS) {
		return "expired";
	}
	// One text per phone: a newer order for the same number carries its own.
	const latest = await db().query.OrdersTable.findFirst({
		columns: { id: true },
		orderBy: desc(OrdersTable.createdAt),
		where: and(
			eq(OrdersTable.customerPhone, payment.order.customerPhone),
			isNull(OrdersTable.deletedAt),
		),
	});
	return latest && latest.id !== payment.order.id ? "superseded" : null;
}

async function ownsLease(job: Pick<ClaimedJob, "id" | "token">) {
	const row = await db().query.PaymentNotificationOutboxTable.findFirst({
		columns: { id: true },
		where: ownedLeaseWhere(job),
	});
	return Boolean(row);
}

async function finish(job: ClaimedJob, status: "sent" | "skipped" | "unknown", errorCode?: string) {
	const [updated] = await db()
		.update(PaymentNotificationOutboxTable)
		.set({
			claimToken: null,
			claimUntil: null,
			lastErrorAt: errorCode ? new Date() : null,
			lastErrorCode: errorCode ?? null,
			status,
		})
		.where(ownedLeaseWhere(job))
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated) {
		await recordOutcome(job, status, errorCode);
	}
}

async function defer(job: ClaimedJob, nextAttemptAt: Date) {
	const [updated] = await db()
		.update(PaymentNotificationOutboxTable)
		.set({ claimToken: null, claimUntil: null, nextAttemptAt, status: "pending" })
		.where(ownedLeaseWhere(job))
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated) {
		await recordOutcome(job, "deferred");
	}
}

async function retry(job: ClaimedJob, code: string) {
	const terminal = job.attemptNumber >= MAX_ATTEMPTS;
	const [updated] = await db()
		.update(PaymentNotificationOutboxTable)
		.set({
			claimToken: null,
			claimUntil: null,
			lastErrorAt: new Date(),
			lastErrorCode: code,
			nextAttemptAt: new Date(
				Date.now() + Math.min(60_000 * 2 ** (job.attemptNumber - 1), 3_600_000),
			),
			status: terminal ? "unknown" : "failed",
		})
		.where(ownedLeaseWhere(job))
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated) {
		await recordOutcome(job, terminal ? "exhausted" : "failed", code);
	}
}

function ownedLeaseWhere(job: Pick<ClaimedJob, "id" | "token">) {
	return and(
		eq(PaymentNotificationOutboxTable.id, job.id),
		eq(PaymentNotificationOutboxTable.status, "claimed"),
		eq(PaymentNotificationOutboxTable.claimToken, job.token),
		gt(PaymentNotificationOutboxTable.claimUntil, new Date()),
	);
}

async function recordOutcome(
	job: Pick<ClaimedJob, "id" | "attemptNumber">,
	outcome: string,
	errorCode?: string,
) {
	await db()
		.update(PaymentNotificationAttemptsTable)
		.set({ errorCode: errorCode ?? null, outcome })
		.where(
			and(
				eq(PaymentNotificationAttemptsTable.outboxId, job.id),
				eq(PaymentNotificationAttemptsTable.attemptNumber, job.attemptNumber),
			),
		);
}
