import * as v from "valibot";

import type { ConversationIO } from "./conversation-io";
import { PAYMENT_WATCH_END_MS, type Payment } from "./conversation-store";
import {
	ALREADY_PAID,
	CLAIM_ACK,
	formatBankDue,
	formatPaid,
	formatReminder,
	TRANSFER_PROMPT,
} from "./copy";
import { errorFields, log, logError } from "./log";
import { storeClient, withTimeout } from "./store";
import { sendTelegramOpsNudge } from "./telegram";
import type { PaymentAction } from "./tools";

const checkPaymentSchema = v.object({ paymentNumber: v.pipe(v.string(), v.minLength(1)) });

export const PAYMENT_DEADLINE_MS = 2 * 60 * 60_000;
const LONG_WATCH_CUTOFF_MS = 48 * 60 * 60_000;
const UB_REMINDER_DELAY_MS = 6 * 60 * 60_000;
const UB_SHIPPED_FALLBACK_MS = 20 * 60 * 60_000;
const COUNTRYSIDE_REMINDER_DELAY_MS = 4 * 60 * 60_000;
const RECON_FAIL_STATES = new Set(["timeout", "ambiguous", "failed", "auth_required"]);
const PAYMENT_TERMINAL_FAIL = "failed";

export type PaymentTickResult =
	| { action: "failed" | "gone" | "paid_sent" | "window_end"; done: true }
	| {
			action:
				| "delivered_sent"
				| "handoff"
				| "ops_nudged"
				| "paid_send_failed"
				| "reminder_sent"
				| "wait";
			done: false;
			nextInSeconds: number;
	  };

// Quiet hours in Ulaanbaatar (UTC+8): 21:30–08:59.
const isQuietHoursUB = (now: number): boolean => {
	const date = new Date(now + 8 * 60 * 60_000);
	const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
	return minutes >= 21 * 60 + 30 || minutes < 9 * 60;
};

// Step-count-safe cadence across 7 days (~272 total steps, well below CF Workflows' 1024 cap):
// 0-2h: 60s (or env), 2-48h: 1800s (30m, or env), 48h-7d: 7200s (2h).
const nextWatchSeconds = (io: ConversationIO, row: Payment, now = Date.now()): number => {
	const fast = Number(io.env.PAYMENT_WATCH_SECONDS ?? "60");
	const slow = Number(io.env.PAYMENT_WATCH_SLOW_SECONDS ?? "1800");
	const fastSec = Number.isFinite(fast) && fast > 0 ? fast : 60;
	const slowSec = Number.isFinite(slow) && slow > 0 ? slow : 1800;
	if (now < row.deadline) {
		return fastSec;
	}
	return now < row.createdAt + LONG_WATCH_CUTOFF_MS ? slowSec : Math.max(slowSec, 7200);
};

const fetchLiveStatus = async (
	io: ConversationIO,
	row: Payment,
): Promise<{ orderStatus?: string; status: string }> => {
	try {
		const res = await storeClient(io.env).payment.getPaymentStatus.query(
			{ checkoutToken: row.checkoutToken, paymentNumber: row.paymentNumber },
			{ signal: withTimeout() },
		);
		return { orderStatus: res.orderStatus, status: res.status };
	} catch {
		return { status: "error" };
	}
};

const reconciliationStatus = async (
	io: ConversationIO,
	row: Payment,
): Promise<string | undefined> => {
	try {
		const res = await storeClient(io.env).payment.getTransferReconciliationStatus.query(
			{ checkoutToken: row.checkoutToken, paymentNumber: row.paymentNumber },
			{ signal: withTimeout() },
		);
		return res === null ? undefined : res.status;
	} catch {
		return undefined;
	}
};

const nudgeOps = async (io: ConversationIO, row: Payment, reason: string): Promise<boolean> => {
	const alertKey = `pay_${row.paymentNumber}:ops_nudge`;
	if (io.store.outboxHas(alertKey)) {
		return false;
	}
	const res = await sendTelegramOpsNudge(io.env, {
		orderNumber: row.orderNumber,
		phone: row.phone,
		reason,
		threadId: io.thread,
		total: row.total,
	}).catch(() => undefined);
	if (res?.ok) {
		io.store.markOutbox(alertKey);
		return true;
	}
	return false;
};

const handlePaid = async (io: ConversationIO, row: Payment, status: string): Promise<boolean> => {
	const paidKey = `pay_${row.paymentNumber}:paid`;
	io.store.markPaymentStatus(row.paymentNumber, "success");
	// Past Meta's 23h window, mark skipped in outbox instead of failing with error 10.
	if (!io.store.within23h()) {
		io.store.markOutbox(paidKey);
		log({
			action: "paid_sent",
			claimed: row.claimed ? 1 : 0,
			event: "payment",
			payment_number: row.paymentNumber,
			status,
			thread: io.thread,
		});
		return true;
	}
	try {
		await io.sendPart(paidKey, { message: formatPaid(row.countryside) });
	} catch (error) {
		logError({
			action: "paid_send_failed",
			claimed: row.claimed ? 1 : 0,
			error: errorFields(error),
			event: "payment",
			payment_number: row.paymentNumber,
			status,
			thread: io.thread,
		});
		return false;
	}
	log({
		action: "paid_sent",
		claimed: row.claimed ? 1 : 0,
		event: "payment",
		payment_number: row.paymentNumber,
		status,
		thread: io.thread,
	});
	return true;
};

const handleDelivered = async (
	io: ConversationIO,
	row: Payment,
	now: number,
): Promise<"delivered_sent" | "ops_nudged" | undefined> => {
	const deliveredKey = `pay_${row.paymentNumber}:delivered`;
	io.store.markPaymentDeliveredAt(row.paymentNumber, now);
	if (row.claimed || io.store.outboxHas(deliveredKey) || io.store.isPaused()) {
		return undefined;
	}
	if (io.store.within23h(now)) {
		try {
			await sendBankDetails(io, deliveredKey, row.paymentNumber, true);
			io.store.markOutbox(deliveredKey);
			log({
				action: "delivered_sent",
				claimed: 0,
				event: "payment",
				payment_number: row.paymentNumber,
				status: row.status,
				thread: io.thread,
			});
			return "delivered_sent";
		} catch {
			return undefined;
		}
	}
	if (await nudgeOps(io, row, "Хүргэгдсэн (23ц хэтэрсэн, төлбөр хүлээгдэж байна)")) {
		io.store.markOutbox(deliveredKey);
		log({
			action: "ops_nudged",
			claimed: 0,
			event: "payment",
			payment_number: row.paymentNumber,
			status: row.status,
			thread: io.thread,
		});
		return "ops_nudged";
	}
	return undefined;
};

const maybeSendReminder = async (
	io: ConversationIO,
	row: Payment,
	orderStatus: string | undefined,
	now: number,
): Promise<"ops_nudged" | "reminder_sent" | undefined> => {
	const reminderKey = `pay_${row.paymentNumber}:reminder`;
	if (
		row.claimed ||
		io.store.outboxHas(reminderKey) ||
		io.store.isPaused() ||
		isQuietHoursUB(now)
	) {
		return undefined;
	}
	const ubDeliveredDue =
		row.deliveredAt !== undefined && now >= row.deliveredAt + UB_REMINDER_DELAY_MS;
	const ubShippedFallbackDue =
		orderStatus === "shipped" && now >= row.createdAt + UB_SHIPPED_FALLBACK_MS;
	const due = row.countryside
		? now >= row.createdAt + COUNTRYSIDE_REMINDER_DELAY_MS
		: ubDeliveredDue || ubShippedFallbackDue;
	if (!due) {
		return undefined;
	}

	if (io.store.within23h(now)) {
		try {
			await io.sendPart(reminderKey, {
				message: formatReminder({
					accountNumber: row.accountNumber,
					orderNumber: row.orderNumber,
					phone: row.phone,
					total: row.total,
				}),
			});
			await io.sendPart(`${reminderKey}:btn`, {
				buttons: [
					{
						payload: `transfer_done:${row.paymentNumber}`,
						title: "Шилжүүлсэн",
						type: "postback",
					},
				],
				message: TRANSFER_PROMPT,
			});
			log({
				action: "reminder_sent",
				claimed: 0,
				event: "payment",
				payment_number: row.paymentNumber,
				status: row.status,
				thread: io.thread,
			});
			return "reminder_sent";
		} catch {
			return undefined;
		}
	}

	if (await nudgeOps(io, row, "Төлбөр ороогүй (23ц хэтэрсэн)")) {
		io.store.markOutbox(reminderKey);
		log({
			action: "ops_nudged",
			claimed: 0,
			event: "payment",
			payment_number: row.paymentNumber,
			status: row.status,
			thread: io.thread,
		});
		return "ops_nudged";
	}
	return undefined;
};

const maybeHandoffUnmatched = async (
	io: ConversationIO,
	row: Payment,
): Promise<{ handedOff: boolean; recon?: string }> => {
	const handoffKey = `pay_${row.paymentNumber}:handoff`;
	if (!row.claimed || io.store.outboxHas(handoffKey) || io.store.isPaused()) {
		return { handedOff: false };
	}
	const recon = await reconciliationStatus(io, row);
	if (recon === undefined || !RECON_FAIL_STATES.has(recon)) {
		return { handedOff: false, recon };
	}
	const extra: Array<string> = [`Order: #${row.orderNumber} · ${row.total}₮ · ${row.phone}`];
	if (row.receiptAmount !== undefined) {
		extra.push(`Receipt amount: ${row.receiptAmount}₮`);
	}
	if (row.receiptUrl !== undefined) {
		extra.push(`Receipt: ${row.receiptUrl}`);
	}
	await io.handoffToAdmin("payment_unmatched", handoffKey, extra);
	return { handedOff: true, recon };
};

const tickPendingPayment = async (
	io: ConversationIO,
	row: Payment,
	live: { orderStatus?: string; status: string },
	now: number,
): Promise<PaymentTickResult> => {
	const nextSec = nextWatchSeconds(io, row, now);

	if (!row.countryside && live.orderStatus === "delivered") {
		const deliveredAction = await handleDelivered(io, row, now);
		if (deliveredAction !== undefined) {
			return { action: deliveredAction, done: false, nextInSeconds: nextSec };
		}
	}

	const reminderAction = await maybeSendReminder(io, row, live.orderStatus, now);
	if (reminderAction !== undefined) {
		return { action: reminderAction, done: false, nextInSeconds: nextSec };
	}

	const { handedOff, recon } = await maybeHandoffUnmatched(io, row);
	const action = handedOff ? "handoff" : "wait";
	log({
		action,
		claimed: row.claimed ? 1 : 0,
		event: "payment",
		payment_number: row.paymentNumber,
		recon,
		status: live.status,
		thread: io.thread,
	});
	return { action, done: false, nextInSeconds: nextSec };
};

export const paymentTick = async (
	io: ConversationIO,
	paymentNumber: string,
): Promise<PaymentTickResult> => {
	const parsed = v.safeParse(checkPaymentSchema, { paymentNumber });
	const row = io.store.paymentByNumber(paymentNumber);
	if (!parsed.success || row === undefined || io.store.outboxHas(`pay_${paymentNumber}:paid`)) {
		log({
			action: "gone",
			claimed: row?.claimed ? 1 : 0,
			event: "payment",
			payment_number: paymentNumber,
			thread: io.thread,
		});
		return { action: "gone", done: true };
	}

	const live = await fetchLiveStatus(io, row);
	if (live.status === "success") {
		const sent = await handlePaid(io, row, live.status);
		return sent
			? { action: "paid_sent", done: true }
			: { action: "paid_send_failed", done: false, nextInSeconds: nextWatchSeconds(io, row) };
	}
	if (live.status === PAYMENT_TERMINAL_FAIL) {
		io.store.markPaymentStatus(paymentNumber, "failed");
		log({
			action: "failed",
			claimed: row.claimed ? 1 : 0,
			event: "payment",
			payment_number: paymentNumber,
			status: live.status,
			thread: io.thread,
		});
		return { action: "failed", done: true };
	}

	const now = Date.now();
	if (now > row.createdAt + PAYMENT_WATCH_END_MS) {
		io.store.markPaymentStatus(paymentNumber, "expired");
		log({
			action: "window_end",
			claimed: row.claimed ? 1 : 0,
			event: "payment",
			payment_number: paymentNumber,
			status: "expired",
			thread: io.thread,
		});
		return { action: "window_end", done: true };
	}

	return tickPendingPayment(io, row, live, now);
};

export const claimTransfer = async (
	io: ConversationIO,
	key: string,
	paymentNumber: string,
	receipt?: { amount?: number; url?: string },
): Promise<boolean> => {
	const row = io.store.paymentByNumber(paymentNumber);
	if (row === undefined) {
		io.tapLog("transfer_done", "no_pending", paymentNumber);
		return false;
	}
	if (row.status === "success") {
		await io.sendPart(`${key}:claim`, { message: ALREADY_PAID });
		io.tapLog("transfer_done", "already_paid", paymentNumber);
		return false;
	}
	if (row.status !== "pending") {
		io.tapLog("transfer_done", "not_pending", paymentNumber);
		return false;
	}
	await io.ensurePaymentWatch(paymentNumber);
	const store = storeClient(io.env);
	const ref = { checkoutToken: row.checkoutToken, paymentNumber };
	await store.payment.claimTransferPaid.mutate(ref, { signal: withTimeout() });
	await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
	io.store.markPaymentClaimed(paymentNumber, receipt);
	await io.sendPart(`${key}:claim`, { message: CLAIM_ACK });
	io.tapLog("transfer_done", "claimed", paymentNumber);
	log({
		action: "claimed",
		claimed: 1,
		event: "payment",
		payment_number: paymentNumber,
		thread: io.thread,
	});
	return true;
};

export const sendBankDetails = async (
	io: ConversationIO,
	key: string,
	paymentNumber: string,
	delivered = false,
): Promise<void> => {
	const row = io.store.paymentByNumber(paymentNumber);
	if (row === undefined) {
		return;
	}
	await io.ensurePaymentWatch(paymentNumber);
	const store = storeClient(io.env);
	const ref = { checkoutToken: row.checkoutToken, paymentNumber };
	try {
		await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() });
	} catch (error) {
		if (error instanceof Error && error.message.includes("ALREADY_PAID")) {
			await io.sendPart(`${key}:bank`, { message: ALREADY_PAID });
			return;
		}
	}
	await io.sendPart(`${key}:bank`, {
		message: formatBankDue({
			accountName: row.accountName,
			accountNumber: row.accountNumber,
			delivered,
			phone: row.phone,
			total: row.total,
		}),
	});
	await io.sendPart(`${key}:bank_btn`, {
		buttons: [
			{
				payload: `transfer_done:${paymentNumber}`,
				title: "Шилжүүлсэн",
				type: "postback",
			},
		],
		message: TRANSFER_PROMPT,
	});
};

export const dispatchPaymentAction = async (
	io: ConversationIO,
	turnId: string,
	action: PaymentAction,
	receiptUrl?: string,
): Promise<string> => {
	if (action.kind === "already_paid") {
		await io.sendPart(`${turnId}:payment`, { message: ALREADY_PAID });
		return "payment_already_paid";
	}
	if (action.kind === "ambiguous") {
		await io.handoffToAdmin("payment_ambiguous", `${turnId}:ambiguous`);
		return "handoff";
	}
	if (action.kind === "claim") {
		await claimTransfer(io, turnId, action.paymentNumber, {
			amount: action.receiptAmount,
			url: receiptUrl,
		});
		return "payment_claimed";
	}
	await sendBankDetails(io, turnId, action.paymentNumber, false);
	return "payment_details";
};

// Best-effort Khaan poll restart only when transfer is actually expected
// (countryside prepay, claimed transfer, or UB order already delivered).
export const recheckTransfer = async (io: ConversationIO): Promise<void> => {
	const row = io.store
		.pendingPayments()
		.find((p) => p.countryside || p.claimed || p.deliveredAt !== undefined);
	if (row === undefined) {
		return;
	}
	const store = storeClient(io.env);
	const ref = { checkoutToken: row.checkoutToken, paymentNumber: row.paymentNumber };
	const live = await store.payment.getPaymentStatus
		.query(ref, { signal: withTimeout() })
		.catch(() => undefined);
	if (live?.provider !== "transfer" || live.status === "success" || live.status === "failed") {
		return;
	}
	await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
};
