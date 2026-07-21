import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
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
// sendSmsAndWait makes at most eleven 10s gateway requests.
const LEASE_MS = 180_000;
const MAX_ATTEMPTS = 5;

type ClaimedJob = {
	id: number;
	paymentNumber: string;
	token: string;
	attemptNumber: number;
};

export async function runPaymentNotificationOutbox() {
	let claimedCount = 0;
	for (let processed = 0; processed < BATCH * 10; processed += 1) {
		const candidate = await findDueJob();
		if (!candidate) break;
		const payment = await paymentQueries.store.getPaymentInfoByNumber(
			candidate.paymentNumber,
		);
		const job = await claimJob(candidate.id);
		if (!job) continue;
		claimedCount += 1;
		if (!payment) await retry(job, "payment_missing");
		else await deliver(job, payment);
	}
	return { claimedCount };
}

async function findDueJob() {
	const now = new Date();
	const jobs = await db()
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
		.limit(1);
	return jobs[0];
}

async function claimJob(id: number): Promise<ClaimedJob | undefined> {
	return db().transaction(async (tx) => {
		const now = new Date();
		const token = crypto.randomUUID();
		const [claimed] = await tx
			.update(PaymentNotificationOutboxTable)
			.set({
				status: "claimed",
				claimToken: token,
				claimUntil: new Date(Date.now() + LEASE_MS),
				attemptCount: sql`${PaymentNotificationOutboxTable.attemptCount} + 1`,
			})
			.where(
				and(
					eq(PaymentNotificationOutboxTable.id, id),
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
		if (!claimed) return;
		await tx.insert(PaymentNotificationAttemptsTable).values({
			outboxId: claimed.id,
			attemptNumber: claimed.attemptCount,
			outcome: "claimed",
		});
		return { ...claimed, token, attemptNumber: claimed.attemptCount };
	});
}

async function deliver(
	job: ClaimedJob,
	payment: NonNullable<
		Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
	>,
) {
	if (!(await ownsLease(job))) return;
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
		return retry(
			job,
			error instanceof SmsRetryableError ? error.code : "store_url_invalid",
		);
	}
}

async function ownsLease(job: Pick<ClaimedJob, "id" | "token">) {
	const row = await db().query.PaymentNotificationOutboxTable.findFirst({
		where: and(
			eq(PaymentNotificationOutboxTable.id, job.id),
			eq(PaymentNotificationOutboxTable.status, "claimed"),
			eq(PaymentNotificationOutboxTable.claimToken, job.token),
			gt(PaymentNotificationOutboxTable.claimUntil, new Date()),
		),
		columns: { id: true },
	});
	return Boolean(row);
}

async function finish(
	job: ClaimedJob,
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
		.where(ownedLeaseWhere(job))
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated) await recordOutcome(job, status, errorCode);
}

async function retry(job: ClaimedJob, code: string) {
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
		.where(ownedLeaseWhere(job))
		.returning({ id: PaymentNotificationOutboxTable.id });
	if (updated)
		await recordOutcome(job, terminal ? "exhausted" : "failed", code);
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
		.set({ outcome, errorCode: errorCode ?? null })
		.where(
			and(
				eq(PaymentNotificationAttemptsTable.outboxId, job.id),
				eq(PaymentNotificationAttemptsTable.attemptNumber, job.attemptNumber),
			),
		);
}
