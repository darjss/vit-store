import * as v from "valibot";

import {
	ALREADY_PAID,
	CLAIM_ACK,
	formatBankDue,
	formatPaid,
	formatReminder,
	TRANSFER_PROMPT,
} from "./copy";
import {
	PAYMENT_WATCH_END_MS,
	type ConversationStore,
	type PaymentDbRow,
} from "./conversation-store";
import type { Env } from "./env";
import { errorFields, log, logError } from "./log";
import { storeClient, withTimeout } from "./store";
import { sendTelegramOpsNudge } from "./telegram";
import type { PaymentAction } from "./tools";
import type { ZernioSendBody } from "./zernio";

const checkPaymentSchema = v.object({ paymentNumber: v.pipe(v.string(), v.minLength(1)) });

export const PAYMENT_DEADLINE_MS = 2 * 60 * 60_000;
const UB_REMINDER_DELAY_MS = 6 * 60 * 60_000;
const COUNTRYSIDE_REMINDER_DELAY_MS = 4 * 60 * 60_000;
const RECON_FAIL_STATES = new Set(["timeout", "ambiguous", "failed", "auth_required"]);
const PAYMENT_TERMINAL_FAIL = "failed";

// Result of one paymentTick RPC: `done` ends the PaymentWatch workflow
// instance; otherwise it sleeps `nextInSeconds` and ticks again.
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

// Quiet hours in Ulaanbaatar (UTC+8): 21:30–08:59. Never nudge customers at night.
const isQuietHoursUB = (now: number): boolean => {
	const ubMs = now + 8 * 60 * 60_000;
	const date = new Date(ubMs);
	const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
	return minutes >= 21 * 60 + 30 || minutes < 9 * 60;
};

type PaymentHost = {
	ensurePaymentWatch(paymentNumber: string): Promise<void>;
	env: Env;
	handoffToAdmin(reason: string, sendKey: string, extraLines?: Array<string>): Promise<void>;
	sendPart(key: string, body: Omit<ZernioSendBody, "accountId">): Promise<void>;
	store: ConversationStore;
	thread(): string;
};

// Owns payment lifecycle: 7-day watch ticks, delivery-day bank push, gentle
// Messenger reminders inside Meta's 23h window (Telegram ops nudge past 23h —
// never SMS), transfer claims, and bank-detail replies.
export class PaymentCoordinator {
	private readonly host: PaymentHost;

	constructor(host: PaymentHost) {
		this.host = host;
	}

	async paymentTick(paymentNumber: string): Promise<PaymentTickResult> {
		const parsed = v.safeParse(checkPaymentSchema, { paymentNumber });
		const thread = this.host.thread();
		const row = this.host.store.paymentByNumber(paymentNumber);
		if (!parsed.success || row === undefined || row.notified === 1) {
			log({
				action: "gone",
				claimed: row?.claimed ?? 0,
				event: "payment",
				payment_number: paymentNumber,
				thread,
			});
			return { action: "gone", done: true };
		}

		const live = await this.fetchLiveStatus(row);
		if (live.status === "success") {
			const sent = await this.handlePaid(row, live.status, thread);
			return sent
				? { action: "paid_sent", done: true }
				: {
						action: "paid_send_failed",
						done: false,
						nextInSeconds: this.nextWatchSeconds(row),
					};
		}
		if (live.status === PAYMENT_TERMINAL_FAIL) {
			this.host.store.markPaymentStatus(paymentNumber, "failed");
			log({
				action: "failed",
				claimed: row.claimed,
				event: "payment",
				payment_number: paymentNumber,
				status: live.status,
				thread,
			});
			return { action: "failed", done: true };
		}

		const now = Date.now();
		if (now > row.created_at + PAYMENT_WATCH_END_MS) {
			// Expire local row so stale unpaid orders can never hijack future chats.
			this.host.store.markPaymentStatus(paymentNumber, "expired");
			log({
				action: "window_end",
				claimed: row.claimed,
				event: "payment",
				payment_number: paymentNumber,
				status: "expired",
				thread,
			});
			return { action: "window_end", done: true };
		}

		return this.tickPendingPayment(row, live, now, thread);
	}

	private async tickPendingPayment(
		row: PaymentDbRow,
		live: { orderStatus?: string; status: string },
		now: number,
		thread: string,
	): Promise<PaymentTickResult> {
		const nextInSeconds = this.nextWatchSeconds(row);

		// 1. UB delivery-day bank push when TU Delivery marks order delivered.
		if (row.countryside === 0 && live.orderStatus === "delivered" && row.delivered_notified === 0) {
			const deliveredAction = await this.handleDelivered(row, now, thread);
			if (deliveredAction !== undefined) {
				return { action: deliveredAction, done: false, nextInSeconds };
			}
		}

		// 2. Single gentle FB reminder (inside <23h) or Telegram ops nudge (>=23h).
		const reminderAction = await this.maybeSendReminder(row, now, thread);
		if (reminderAction !== undefined) {
			return { action: reminderAction, done: false, nextInSeconds };
		}

		// 3. Claimed transfer whose Khan Bank reconciliation failed -> handoff.
		const { handedOff, recon } = await this.maybeHandoffUnmatched(row);
		const action = handedOff ? "handoff" : "wait";
		log({
			action,
			claimed: row.claimed,
			event: "payment",
			payment_number: row.payment_number,
			recon,
			status: live.status,
			thread,
		});
		return { action, done: false, nextInSeconds };
	}

	async claimTransfer(
		key: string,
		paymentNumber: string,
		receipt?: { amount?: number; url?: string },
	): Promise<boolean> {
		const row = this.host.store.paymentByNumber(paymentNumber);
		if (row === undefined || row.status !== "pending") {
			this.tapLog("transfer_done", "no_pending", paymentNumber);
			return false;
		}
		await this.host.ensurePaymentWatch(paymentNumber);
		const store = storeClient(this.host.env);
		const ref = { checkoutToken: row.checkout_token ?? undefined, paymentNumber };
		await store.payment.claimTransferPaid.mutate(ref, { signal: withTimeout() });
		await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
		this.host.store.markPaymentClaimed(paymentNumber, receipt);
		await this.host.sendPart(`${key}:claim`, { message: CLAIM_ACK });
		this.tapLog("transfer_done", "claimed", paymentNumber);
		log({
			action: "claimed",
			claimed: 1,
			event: "payment",
			payment_number: paymentNumber,
			thread: this.host.thread(),
		});
		return true;
	}

	async sendBankDetails(key: string, paymentNumber: string, delivered = false): Promise<void> {
		const row = this.host.store.paymentByNumber(paymentNumber);
		if (row === undefined) {
			return;
		}
		await this.host.ensurePaymentWatch(paymentNumber);
		const store = storeClient(this.host.env);
		const ref = { checkoutToken: row.checkout_token ?? undefined, paymentNumber };
		try {
			await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() });
		} catch (error) {
			if (error instanceof Error && error.message.includes("ALREADY_PAID")) {
				await this.host.sendPart(`${key}:bank`, { message: ALREADY_PAID });
				return;
			}
			// Best effort: still send bank details even if reconciler restart failed.
		}
		await this.host.sendPart(`${key}:bank`, {
			message: formatBankDue({
				accountName: row.account_name ?? "",
				accountNumber: row.account_number ?? "",
				delivered,
				phone: row.phone,
				total: row.total,
			}),
		});
		await this.host.sendPart(`${key}:bank_btn`, {
			buttons: [
				{
					payload: `transfer_done:${paymentNumber}`,
					title: "Шилжүүлсэн",
					type: "postback",
				},
			],
			message: TRANSFER_PROMPT,
		});
	}

	async dispatchPaymentAction(
		turnId: string,
		action: PaymentAction,
		receiptUrl?: string,
	): Promise<string> {
		if (action.kind === "already_paid") {
			await this.host.sendPart(`${turnId}:payment`, { message: ALREADY_PAID });
			return "payment_already_paid";
		}
		if (action.kind === "ambiguous") {
			await this.host.handoffToAdmin("payment_ambiguous", `${turnId}:ambiguous`);
			return "handoff";
		}
		if (action.kind === "claim") {
			await this.claimTransfer(turnId, action.paymentNumber, {
				amount: action.receiptAmount,
				url: receiptUrl,
			});
			return "payment_claimed";
		}
		await this.sendBankDetails(turnId, action.paymentNumber, false);
		return "payment_details";
	}

	// Best-effort poll restart when a customer writes after the initial 5m Khaan window.
	async recheckTransfer(): Promise<void> {
		const row = this.host.store.pendingPaymentRows()[0];
		if (row === undefined) {
			return;
		}
		const store = storeClient(this.host.env);
		const ref = {
			checkoutToken: row.checkout_token ?? undefined,
			paymentNumber: row.payment_number,
		};
		const live = await store.payment.getPaymentStatus
			.query(ref, { signal: withTimeout() })
			.catch(() => undefined);
		if (live?.provider !== "transfer" || live.status === "success" || live.status === "failed") {
			return;
		}
		await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
	}

	private async fetchLiveStatus(
		row: PaymentDbRow,
	): Promise<{ orderStatus?: string; status: string }> {
		try {
			const res = await storeClient(this.host.env).payment.getPaymentStatus.query(
				{
					checkoutToken: row.checkout_token ?? undefined,
					paymentNumber: row.payment_number,
				},
				{ signal: withTimeout() },
			);
			return { orderStatus: res.orderStatus, status: res.status };
		} catch {
			return { status: "error" };
		}
	}

	private async handlePaid(row: PaymentDbRow, status: string, thread: string): Promise<boolean> {
		this.host.store.markPaymentStatus(row.payment_number, "success");
		// Past Meta's 23h window, mark notified silently instead of failing with error 10.
		if (!this.host.store.within23h()) {
			this.host.store.markPaymentNotified(row.payment_number);
			log({
				action: "paid_sent",
				claimed: row.claimed,
				event: "payment",
				payment_number: row.payment_number,
				status,
				thread,
			});
			return true;
		}
		try {
			await this.host.sendPart(`pay_${row.payment_number}:paid`, {
				message: formatPaid(row.countryside === 1),
			});
			this.host.store.markPaymentNotified(row.payment_number);
		} catch (error) {
			logError({
				action: "paid_send_failed",
				claimed: row.claimed,
				error: errorFields(error),
				event: "payment",
				payment_number: row.payment_number,
				status,
				thread,
			});
			return false;
		}
		log({
			action: "paid_sent",
			claimed: row.claimed,
			event: "payment",
			payment_number: row.payment_number,
			status,
			thread,
		});
		return true;
	}

	private async handleDelivered(
		row: PaymentDbRow,
		now: number,
		thread: string,
	): Promise<"delivered_sent" | "ops_nudged" | undefined> {
		if (this.host.store.within23h(now)) {
			try {
				await this.sendBankDetails(`pay_${row.payment_number}:delivered`, row.payment_number, true);
				this.host.store.markPaymentDelivered(row.payment_number, now, true);
				log({
					action: "delivered_sent",
					claimed: row.claimed,
					event: "payment",
					payment_number: row.payment_number,
					status: row.status,
					thread,
				});
				return "delivered_sent";
			} catch {
				return undefined;
			}
		}
		// Past 23h window: no SMS; nudge admin on Telegram so human can follow up in Meta Inbox.
		this.host.store.markPaymentDelivered(row.payment_number, now, true);
		if (row.ops_nudged === 0) {
			await this.nudgeOps(row, "Хүргэгдсэн (23ц хэтэрсэн, төлбөр хүлээгдэж байна)");
			this.host.store.markPaymentOpsNudged(row.payment_number);
			log({
				action: "ops_nudged",
				claimed: row.claimed,
				event: "payment",
				payment_number: row.payment_number,
				status: row.status,
				thread,
			});
			return "ops_nudged";
		}
		return undefined;
	}

	private async maybeSendReminder(
		row: PaymentDbRow,
		now: number,
		thread: string,
	): Promise<"ops_nudged" | "reminder_sent" | undefined> {
		if (row.claimed !== 0 || row.reminder_sent !== 0 || isQuietHoursUB(now)) {
			return undefined;
		}
		const due =
			row.countryside === 1
				? now >= row.created_at + COUNTRYSIDE_REMINDER_DELAY_MS
				: row.delivered_at !== null && now >= row.delivered_at + UB_REMINDER_DELAY_MS;
		if (!due) {
			return undefined;
		}

		if (this.host.store.within23h(now)) {
			try {
				const key = `pay_${row.payment_number}:reminder`;
				await this.host.sendPart(key, {
					message: formatReminder({
						accountNumber: row.account_number ?? "",
						orderNumber: row.order_number,
						phone: row.phone,
						total: row.total,
					}),
				});
				await this.host.sendPart(`${key}:btn`, {
					buttons: [
						{
							payload: `transfer_done:${row.payment_number}`,
							title: "Шилжүүлсэн",
							type: "postback",
						},
					],
					message: TRANSFER_PROMPT,
				});
				this.host.store.markPaymentReminderSent(row.payment_number, false);
				log({
					action: "reminder_sent",
					claimed: row.claimed,
					event: "payment",
					payment_number: row.payment_number,
					status: row.status,
					thread,
				});
				return "reminder_sent";
			} catch {
				return undefined;
			}
		}

		if (row.ops_nudged === 0) {
			await this.nudgeOps(row, "Төлбөр ороогүй (23ц хэтэрсэн)");
			this.host.store.markPaymentReminderSent(row.payment_number, true);
			log({
				action: "ops_nudged",
				claimed: row.claimed,
				event: "payment",
				payment_number: row.payment_number,
				status: row.status,
				thread,
			});
			return "ops_nudged";
		}
		this.host.store.markPaymentReminderSent(row.payment_number, false);
		return undefined;
	}

	private async maybeHandoffUnmatched(
		row: PaymentDbRow,
	): Promise<{ handedOff: boolean; recon?: string }> {
		if (row.claimed !== 1 || row.handed_off !== 0) {
			return { handedOff: false };
		}
		const recon = await this.reconciliationStatus(row);
		if (recon === undefined || !RECON_FAIL_STATES.has(recon)) {
			return { handedOff: false, recon };
		}
		const extra: Array<string> = [`Order: #${row.order_number} · ${row.total}₮ · ${row.phone}`];
		if (row.receipt_amount !== null) {
			extra.push(`Receipt amount: ${row.receipt_amount}₮`);
		}
		if (row.receipt_url !== null) {
			extra.push(`Receipt: ${row.receipt_url}`);
		}
		await this.host.handoffToAdmin("payment_unmatched", `pay_${row.payment_number}:handoff`, extra);
		this.host.store.markPaymentHandedOff(row.payment_number);
		return { handedOff: true, recon };
	}

	private async nudgeOps(row: PaymentDbRow, reason: string): Promise<void> {
		const alertKey = `pay_${row.payment_number}:ops_nudge`;
		if (this.host.store.outboxHas(alertKey)) {
			return;
		}
		const res = await sendTelegramOpsNudge(this.host.env, {
			orderNumber: row.order_number,
			phone: row.phone,
			reason,
			threadId: this.host.thread(),
			total: row.total,
		}).catch(() => undefined);
		if (res?.ok) {
			this.host.store.markOutbox(alertKey);
		}
	}

	private async reconciliationStatus(row: PaymentDbRow): Promise<string | undefined> {
		try {
			const res = await storeClient(this.host.env).payment.getTransferReconciliationStatus.query(
				{
					checkoutToken: row.checkout_token ?? undefined,
					paymentNumber: row.payment_number,
				},
				{ signal: withTimeout() },
			);
			return res === null ? undefined : res.status;
		} catch {
			return undefined;
		}
	}

	private nextWatchSeconds(row: PaymentDbRow): number {
		const fast = Number(this.host.env.PAYMENT_WATCH_SECONDS ?? "60");
		const slow = Number(this.host.env.PAYMENT_WATCH_SLOW_SECONDS ?? "900");
		const fastSec = Number.isFinite(fast) && fast > 0 ? fast : 60;
		const slowSec = Number.isFinite(slow) && slow > 0 ? slow : 900;
		return Date.now() >= row.deadline ? slowSec : fastSec;
	}

	private tapLog(kind: string, outcome: string, paymentNumber?: string): void {
		log({
			event: "tap",
			kind,
			outcome,
			payment_number: paymentNumber,
			thread: this.host.thread(),
		});
	}
}
