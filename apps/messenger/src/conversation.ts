import {
	generateText,
	hasToolCall,
	stepCountIs,
	type ImagePart,
	type ModelMessage,
	type TextPart,
	type ToolSet,
} from "ai";
import { Agent } from "agents";
import * as v from "valibot";
import { zernioMessageEventSchema } from "./admit";
import {
	cartQuickReplies,
	formatCartSummary,
	isTransferDoneText,
	parseCartPayload,
	parseDeliveryChangePayload,
	parseOrderConfirmPayload,
	parseOrderPayload,
	parsePayTransferPayload,
	parseTransferDonePayload,
	phonesInText,
	buildQpayPageUrl,
	type CartLine,
} from "./cart";
import {
	ALREADY_PAID,
	CART_CHANGED,
	CART_EMPTY,
	CLAIM_ACK,
	CONFIRM_PROMPT,
	ERROR,
	formatBankDetails,
	formatConfirmSummary,
	formatOrderCreated,
	formatPaid,
	HANDOFF,
	IMAGE_UNREADABLE,
	NEEDS_DELIVERY,
	PAY_PROMPT,
	TRANSFER_PROMPT,
} from "./copy";
import type { Env } from "./env";
import { errorFields, log, logError, turnFailedLog, turnLog } from "./log";
import { createModel, modelName, providerOptions } from "./model";
import { fetchImageParts } from "./photos";
import { stateNote, SYSTEM_PROMPT } from "./prompt";
import { renderTurn } from "./render";
import { botClient, storeClient, withTimeout } from "./store";
import { sendTelegramAlert } from "./telegram";
import { createTools, replyInputSchema, type CheckoutState, type ReplyResult } from "./tools";
import { adProductIds, listMessages, send, type ZernioSendBody } from "./zernio";

// A chat message handed from Ingress (mapped off the Chat SDK Message) or
// rebuilt from a persisted inbox payload on recovery. `raw` is the Zernio
// message object plus merged top-level metadata — the adapter drops event id
// and timestamps, so `inbox.payload` is the source of truth for both.
const inboundItemSchema = v.looseObject({
	attachments: v.optional(
		v.array(v.looseObject({ type: v.string(), url: v.optional(v.nullable(v.string())) })),
	),
	id: v.string(),
	raw: v.optional(v.unknown()),
	text: v.string(),
});
const inboundItemsSchema = v.array(inboundItemSchema);
export type InboundItem = v.InferOutput<typeof inboundItemSchema>;

// Messenger stickers (including the thumbs-up "like") arrive as image
// attachments on the /t39.1997-6/ CDN namespace; real photos are /t1.15752-9/.
// Drop them so a sticker never reaches the photo fetch or the transfer-receipt
// check, and leave a "[стикер]" marker in the text instead.
const isStickerAttachment = (a: { type: string; url?: null | string }): boolean => {
	if (a.type !== "image" || !a.url) {
		return false;
	}
	try {
		return new URL(a.url).pathname.includes("/t39.1997-6/");
	} catch {
		return a.url.includes("/t39.1997-6/");
	}
};

export const normalizeInboundItem = (item: InboundItem): InboundItem => {
	const attachments = item.attachments ?? [];
	const stickers = attachments.filter(isStickerAttachment).length;
	if (stickers === 0) {
		return item;
	}
	const parts = [item.text, ...Array.from({ length: stickers }, () => "[стикер]")];
	return {
		...item,
		attachments: attachments.filter((a) => !isStickerAttachment(a)),
		text: parts.filter((t) => t.length > 0).join("\n"),
	};
};

const inboundRawSchema = v.looseObject({
	id: v.optional(v.string()),
	metadata: v.optional(
		v.nullable(
			v.looseObject({
				postbackPayload: v.optional(v.string()),
				quickReplyPayload: v.optional(v.string()),
				referral: v.optional(v.nullable(v.looseObject({ ad_id: v.optional(v.string()) }))),
			}),
		),
	),
	platformMessageId: v.optional(v.string()),
});

const noteInboundSchema = v.object({
	eventId: v.pipe(v.string(), v.minLength(1)),
	payload: zernioMessageEventSchema,
});

const checkPaymentSchema = v.object({ paymentNumber: v.pipe(v.string(), v.minLength(1)) });

const HISTORY_TURNS = 20;
const MAX_STEPS = 5;
const MAX_ATTEMPTS = 3;
// Rows older than this or past MAX_ATTEMPTS go to 'failed' and hand off.
// Zernio's own retry window is 3 minutes; past 10 the event is dead anyway.
const REPROCESS_MAX_AGE_MS = 10 * 60_000;
// A 'processing' row older than this had its worker die mid-turn; safe to
// reclaim. Outbound sends still can't double-post — outbox keys gate them.
const CLAIM_STALE_MS = 90_000;
const FALLBACK_TEXT = "Шалгаад хэлье.";
const prefillLog = (outcome: string, thread: string): void =>
	log({ event: "history_prefill", outcome, thread });
const PAUSE_MS = 12 * 60 * 60_000;
const PAYMENT_DEADLINE_MS = 2 * 60 * 60_000;
// After the payment deadline the watcher keeps polling: a late QPay or
// reconciled transfer still gets announced, just less often.
const PAYMENT_WATCH_END_MS = 24 * 60 * 60_000;
const RECON_FAIL_STATES = new Set(["timeout", "ambiguous", "failed", "auth_required"]);
// Terminal payment statuses from the store (packages/shared paymentStatus):
// "failed" is the only terminal non-success one.
const PAYMENT_TERMINAL_FAIL = "failed";

// The validated outcome of a model turn, written to `turns` before the first
// send. A retried turn replays this instead of re-running the model.
type TurnOutcome = {
	handoff?: string;
	reply?: ReplyResult;
	superseded?: boolean;
};

// Result of one paymentTick RPC: `done` ends the PaymentWatch workflow
// instance; otherwise it sleeps `nextInSeconds` and ticks again.
export type PaymentTickResult =
	| { action: "failed" | "gone" | "paid_sent" | "window_end"; done: true }
	| { action: "handoff" | "paid_send_failed" | "wait"; done: false; nextInSeconds: number };

type InboxRow = {
	at: number;
	attempts: number;
	claimed_at: number | null;
	event_id: string;
	payload: string;
	seq: number;
	status: string;
	turn_id: string | null;
};

type CartRow = { name: string; price: number; product_id: number; qty: number };

type CheckoutRow = {
	address: string | null;
	countryside: number;
	id: number;
	note: string | null;
	phone: string | null;
	revision: number;
};

type PaymentDbRow = {
	account_name: string | null;
	account_number: string | null;
	checkout_token: string | null;
	claimed: number;
	countryside: number;
	created_at: number;
	deadline: number;
	handed_off: number;
	notified: number;
	order_number: string;
	payment_number: string;
	phone: string;
	revision: number;
	status: string;
	total: number;
	transfer_shown: number;
};

type RowAction =
	| { kind: "ambiguous" }
	| { kind: "claim"; paymentNumber: string }
	| { item: InboundItem; kind: "model" }
	| { kind: "none" }
	| { kind: "tap"; payload: string };

const rowToCartLine = (r: CartRow): CartLine => ({
	name: r.name,
	price: r.price,
	productId: r.product_id,
	qty: r.qty,
});

// Every sendable turn goes through this DO, one at a time. Durability shape
// from the plan: `inbox` records admitted events before Chat SDK sees them,
// `outbox` records send parts only after success, `messages` keeps whole model
// turns so history replays with tool calls and results paired. Cart, checkout
// and payment rows carry the customer order flow between turns.
export class Conversation extends Agent<Env> {
	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS inbox (
				event_id TEXT PRIMARY KEY,
				seq INTEGER NOT NULL,
				payload TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				at INTEGER NOT NULL,
				claimed_at INTEGER,
				attempts INTEGER NOT NULL DEFAULT 0,
				turn_id TEXT
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				turn_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`;
		void this
			.sql`CREATE TABLE IF NOT EXISTS outbox (key TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS turns (
				turn_id TEXT PRIMARY KEY,
				reply TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`;
		void this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS cart (
				product_id INTEGER PRIMARY KEY,
				qty INTEGER NOT NULL,
				name TEXT NOT NULL,
				price INTEGER NOT NULL
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS checkout (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				revision INTEGER NOT NULL DEFAULT 0,
				phone TEXT,
				address TEXT,
				note TEXT,
				countryside INTEGER NOT NULL DEFAULT 0
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS payments (
				payment_number TEXT PRIMARY KEY,
				order_number TEXT NOT NULL,
				revision INTEGER UNIQUE NOT NULL,
				checkout_token TEXT,
				account_name TEXT,
				account_number TEXT,
				total INTEGER NOT NULL,
				phone TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				claimed INTEGER NOT NULL DEFAULT 0,
				deadline INTEGER NOT NULL,
				notified INTEGER NOT NULL DEFAULT 0,
				handed_off INTEGER NOT NULL DEFAULT 0,
				transfer_shown INTEGER NOT NULL DEFAULT 0,
				countryside INTEGER NOT NULL DEFAULT 0
			)`;
		// Deployed DOs already have these tables; add the column only to the
		// ones missing it (ALTER TABLE has no IF NOT EXISTS).
		const checkoutCols = this.sql<{ name: string }>`
			SELECT name FROM pragma_table_info(${"checkout"})`;
		if (!checkoutCols.some((c) => c.name === "countryside")) {
			void this.sql`ALTER TABLE checkout ADD COLUMN countryside INTEGER NOT NULL DEFAULT 0`;
		}
		const paymentCols = this.sql<{ name: string }>`
			SELECT name FROM pragma_table_info(${"payments"})`;
		if (!paymentCols.some((c) => c.name === "countryside")) {
			void this.sql`ALTER TABLE payments ADD COLUMN countryside INTEGER NOT NULL DEFAULT 0`;
		}

		const pending = this.pendingRows();
		if (pending.length > 0) {
			this.ctx.waitUntil(this.processItems(pending));
		}
	}

	// Admission -> durable commit point, before Chat SDK sees the event.
	async noteInbound(input: {
		eventId: string;
		payload: v.InferOutput<typeof zernioMessageEventSchema>;
	}): Promise<{ inserted: boolean }> {
		// RPC args arrive structured-cloned from the Ingress DO; parse anyway so
		// a malformed caller can't poison the inbox.
		const parsed = v.safeParse(noteInboundSchema, input);
		if (!parsed.success) {
			throw new Error("noteInbound: bad input");
		}
		const { eventId, payload } = parsed.output;
		const exists =
			this.sql<{ event_id: string }>`SELECT event_id FROM inbox WHERE event_id = ${eventId}`
				.length > 0;
		if (exists) {
			return { inserted: false };
		}
		const seqRow = this.sql<{ max: number }>`SELECT COALESCE(MAX(seq), 0) AS max FROM inbox`;
		const seq = (seqRow[0]?.max ?? 0) + 1;
		void this.sql`
			INSERT INTO inbox (event_id, seq, payload, status, at)
			VALUES (${eventId}, ${seq}, ${JSON.stringify(payload)}, 'pending', ${Date.now()})`;
		this.setMeta("latest_seq", String(seq));
		// Chat SDK may never call process() (dropped, deduped, or a dead
		// adapter): the recovery schedule is the row's only guaranteed wake-up.
		await this.armRecovery();
		return { inserted: true };
	}

	async process(items: Array<InboundItem>): Promise<void> {
		const parsed = v.safeParse(inboundItemsSchema, items);
		if (!parsed.success) {
			logError({
				event: "error",
				issues: parsed.issues
					.map((i) => i.message)
					.join("; ")
					.slice(0, 300),
				thread: this.name ?? "",
				where: "process_items",
			});
			return;
		}
		const rows: Array<InboxRow> = [];
		for (const item of parsed.output) {
			const row = this.findPendingRow(item);
			if (row !== undefined) {
				rows.push(row);
			}
		}
		await this.processItems(rows);
	}

	// One payment-watch tick, RPC'd by the PaymentWatch workflow instance for
	// this payment (retried steps and durable sleeps live there). `done` ends
	// the instance; otherwise it sleeps `nextInSeconds` and ticks again — fast
	// until the 2h deadline, slow until 24h after creation.
	async paymentTick(paymentNumber: string): Promise<PaymentTickResult> {
		const parsed = v.safeParse(checkPaymentSchema, { paymentNumber });
		const thread = this.name ?? "";
		const row = this.paymentByNumber(paymentNumber);
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
		if (Date.now() > row.created_at + PAYMENT_WATCH_END_MS) {
			log({
				action: "window_end",
				claimed: row.claimed,
				event: "payment",
				payment_number: paymentNumber,
				status: row.status,
				thread,
			});
			return { action: "window_end", done: true };
		}
		let status = "error";
		try {
			const res = await storeClient(this.env).payment.getPaymentStatus.query(
				{
					checkoutToken: row.checkout_token ?? undefined,
					paymentNumber,
				},
				{ signal: withTimeout() },
			);
			status = res.status;
		} catch {
			// status stays "error"; the workflow's next tick retries.
		}
		if (status === "success") {
			const sent = await this.paymentPaid(row, paymentNumber, status, thread);
			if (!sent) {
				return {
					action: "paid_send_failed",
					done: false,
					nextInSeconds: this.nextWatchSeconds(row),
				};
			}
			return { action: "paid_sent", done: true };
		}
		if (status === PAYMENT_TERMINAL_FAIL) {
			void this.sql`UPDATE payments SET status = 'failed' WHERE payment_number = ${paymentNumber}`;
			log({
				action: "failed",
				claimed: row.claimed,
				event: "payment",
				payment_number: paymentNumber,
				status,
				thread,
			});
			return { action: "failed", done: true };
		}
		const { handedOff, recon } = await this.paymentHandoff(row, paymentNumber);
		const action = handedOff ? "handoff" : "wait";
		log({
			action,
			claimed: row.claimed,
			event: "payment",
			payment_number: paymentNumber,
			recon,
			status,
			thread,
		});
		return {
			action,
			done: false,
			nextInSeconds: this.nextWatchSeconds(row),
		};
	}

	private nextWatchSeconds(row: PaymentDbRow): number {
		return Date.now() >= row.deadline ? this.slowWatchSeconds() : this.watchSeconds();
	}

	// Paid tick: flip the row, send the paid message, mark notified. The
	// notified flag flips only after the send lands: a failed send logs
	// paid_send_failed and the tick keeps running — the next tick re-queries
	// the store, sees success again, and retries (outbox key dedupes). A
	// thrown step error would exhaust the workflow's retries and lose the
	// paid notification for good.
	private async paymentPaid(
		row: PaymentDbRow,
		paymentNumber: string,
		status: string,
		thread: string,
	): Promise<boolean> {
		void this.sql`UPDATE payments SET status = 'success' WHERE payment_number = ${paymentNumber}`;
		try {
			await this.sendPart(`pay_${paymentNumber}:paid`, {
				message: formatPaid(row.countryside === 1),
			});
			void this.sql`UPDATE payments SET notified = 1 WHERE payment_number = ${paymentNumber}`;
		} catch (error) {
			logError({
				action: "paid_send_failed",
				claimed: row.claimed,
				error: errorFields(error),
				event: "payment",
				payment_number: paymentNumber,
				status,
				thread,
			});
			return false;
		}
		log({
			action: "paid_sent",
			claimed: row.claimed,
			event: "payment",
			payment_number: paymentNumber,
			status,
			thread,
		});
		return true;
	}

	// A claimed transfer whose reconciliation died gets one handoff; the watch
	// keeps running afterwards so a late QPay or reconciled transfer is still
	// announced.
	private async paymentHandoff(
		row: PaymentDbRow,
		paymentNumber: string,
	): Promise<{ handedOff: boolean; recon?: string }> {
		if (row.claimed !== 1 || row.handed_off !== 0) {
			return { handedOff: false };
		}
		const recon = await this.reconciliationStatus(row);
		if (recon === undefined || !RECON_FAIL_STATES.has(recon)) {
			return { handedOff: false, recon };
		}
		// handed_off flips only after the handoff ran: a thrown customer send
		// must let the retried tick redo the handoff (outbox keys dedupe).
		await this.handoffToAdmin("payment_unmatched", `pay_${paymentNumber}:handoff`);
		void this.sql`UPDATE payments SET handed_off = 1 WHERE payment_number = ${paymentNumber}`;
		return { handedOff: true, recon };
	}

	private watchSeconds(): number {
		const raw = Number(this.env.PAYMENT_WATCH_SECONDS ?? "60");
		return Number.isFinite(raw) && raw > 0 ? raw : 60;
	}

	private slowWatchSeconds(): number {
		const raw = Number(this.env.PAYMENT_WATCH_SLOW_SECONDS ?? "900");
		return Number.isFinite(raw) && raw > 0 ? raw : 900;
	}

	// Starting the watch must never fail the order: a tracked instance is
	// skipped, and a failed create only logs — a missing watch is healed the
	// next time ensurePaymentWatch is called for the payment (resent confirm,
	// transfer claim).
	private async ensurePaymentWatch(paymentNumber: string): Promise<void> {
		const id = `pay_${paymentNumber}`;
		if (this.getWorkflow(id) !== undefined) {
			return;
		}
		try {
			await this.runWorkflow("PAYMENT_WATCH", { paymentNumber }, { id });
		} catch (error) {
			logError({
				error: errorFields(error),
				event: "error",
				thread: this.name ?? "",
				where: "payment_watch_start",
			});
		}
	}

	private async reconciliationStatus(row: PaymentDbRow): Promise<string | undefined> {
		try {
			const res = await storeClient(this.env).payment.getTransferReconciliationStatus.query(
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

	// ─── Tool-facing state (ToolDeps) ─────────────────────────────────────────

	cartLines(): Array<CartLine> {
		return this.sql<CartRow>`SELECT product_id, qty, name, price FROM cart ORDER BY product_id`.map(
			rowToCartLine,
		);
	}

	async cartSet(productId: number, quantity: number): Promise<void> {
		if (quantity === 0) {
			void this.sql`DELETE FROM cart WHERE product_id = ${productId}`;
			this.bumpRevision();
			return;
		}
		const products = await storeClient(this.env).product.getProductsByIdsForAssistant.query(
			{ ids: [productId] },
			{ signal: withTimeout() },
		);
		const product = products.find((p) => p.id === productId);
		if (product === undefined) {
			throw new Error("product_not_found");
		}
		void this.sql`
			INSERT INTO cart (product_id, qty, name, price) VALUES (${productId}, ${quantity}, ${product.name}, ${product.price})
			ON CONFLICT(product_id) DO UPDATE SET qty = ${quantity}`;
		this.bumpRevision();
	}

	checkout(): CheckoutState {
		const row = this.checkoutRow();
		return {
			address: row.address ?? undefined,
			countryside: row.countryside === 1,
			note: row.note ?? undefined,
			phone: row.phone ?? undefined,
			revision: row.revision,
		};
	}

	latestPayment():
		| {
				checkoutToken?: string;
				claimed: number;
				createdAt: number;
				orderNumber: string;
				paymentNumber: string;
				status: string;
		  }
		| undefined {
		const row = this.sql<PaymentDbRow>`
			SELECT * FROM payments ORDER BY created_at DESC LIMIT 1`[0];
		if (row === undefined) {
			return undefined;
		}
		return {
			checkoutToken: row.checkout_token ?? undefined,
			claimed: row.claimed,
			createdAt: row.created_at,
			orderNumber: row.order_number,
			paymentNumber: row.payment_number,
			status: row.status,
		};
	}

	recentCustomerTexts(): Array<string> {
		const rows = this.sql<Pick<InboxRow, "payload">>`
			SELECT payload FROM inbox ORDER BY seq DESC LIMIT 10`;
		const texts: Array<string> = [];
		for (const row of rows) {
			const envelope = v.safeParse(zernioMessageEventSchema, JSON.parse(row.payload));
			const text = envelope.success ? envelope.output.message.text : undefined;
			if (text) {
				texts.push(text);
			}
		}
		return texts;
	}

	saveDelivery(input: {
		address?: string;
		countryside?: boolean;
		note?: string;
		phone?: string;
	}): void {
		this.ensureCheckout();
		const current = this.checkoutRow();
		void this.sql`
			UPDATE checkout SET
				phone = ${input.phone ?? current.phone},
				address = ${input.address ?? current.address},
				note = ${input.note ?? current.note},
				countryside = ${input.countryside === undefined ? current.countryside : input.countryside ? 1 : 0}
			WHERE id = 1`;
		this.bumpRevision();
	}

	// Returning customers whose history predates this worker: once per
	// conversation, scan the last 100 Zernio messages for a phone and reuse the
	// first one the store knows a saved address for. Best-effort (4 s budget),
	// never fails the turn.
	private async prefillDeliveryFromHistory(): Promise<void> {
		if (this.getMeta("history_checked") !== undefined) {
			return;
		}
		this.setMeta("history_checked", "1");
		const client = botClient(this.env);
		if (this.checkoutRow().phone !== null || client === undefined) {
			return;
		}
		try {
			const budget = AbortSignal.timeout(4000);
			const messages = await listMessages(
				this.env,
				this.conversationId(),
				this.accountId(),
				100,
				budget,
			);
			const candidates: Array<string> = [];
			for (const message of messages) {
				if (message.direction !== "incoming" || message.message === undefined) {
					continue;
				}
				for (const phone of phonesInText(message.message)) {
					if (!candidates.includes(phone)) {
						candidates.push(phone);
					}
				}
				if (candidates.length >= 3) {
					break;
				}
			}
			candidates.splice(3);
			for (const phone of candidates) {
				try {
					const customer = await client.customer.getCustomerByPhone.query(
						{ phone: Number(phone) },
						{ signal: budget },
					);
					if (customer.address) {
						this.saveDelivery({ address: customer.address, phone });
						prefillLog("found", this.name);
						return;
					}
				} catch {
					// NOT_FOUND, timeout, anything else: try the next candidate.
				}
			}
			prefillLog("none", this.name);
		} catch {
			prefillLog("error", this.name);
		}
	}

	// ─── Admin ──────────────────────────────────────────────────────────────

	adminSnapshot() {
		const messages = this.sql<{ content: string; role: string }>`
			SELECT role, content FROM messages ORDER BY created_at ASC`.map((row) => ({
			role: row.role,
			text: this.messageText(row.content),
		}));
		const inbox = this.sql<InboxRow>`
			SELECT event_id, seq, status, at, claimed_at, attempts, turn_id, payload FROM inbox
			ORDER BY seq ASC`.map(({ at, attempts, claimed_at, event_id, seq, status, turn_id }) => ({
			at,
			attempts,
			claimed_at,
			event_id,
			seq,
			status,
			turn_id,
		}));
		return {
			cart: this.cartLines(),
			checkout: this.checkout(),
			inbox,
			messages,
			paused_until: this.getMeta("paused_until") ?? null,
			payments: this.sql<PaymentDbRow>`SELECT * FROM payments ORDER BY created_at ASC`,
		};
	}

	adminResume() {
		void this.sql`DELETE FROM meta WHERE key = 'paused_until'`;
		return { resumed: true };
	}

	// The agent-readable transcript: full ModelMessages (tool calls and
	// results stay paired), raw inbox payloads, saved turn outcomes and every
	// send, all in chronological order.
	adminTranscript() {
		const inbox = this.sql<InboxRow>`
			SELECT event_id, seq, status, at, claimed_at, attempts, turn_id, payload FROM inbox
			ORDER BY seq ASC`.map((row) => {
			const parsed = v.safeParse(zernioMessageEventSchema, JSON.parse(row.payload));
			return {
				at: row.at,
				attempts: row.attempts,
				claimed_at: row.claimed_at,
				event_id: row.event_id,
				payload: parsed.success ? parsed.output : row.payload,
				seq: row.seq,
				status: row.status,
				turn_id: row.turn_id,
			};
		});
		const messages = this.sql<{
			content: string;
			created_at: number;
			id: string;
			role: string;
			turn_id: string;
		}>`
			SELECT id, turn_id, role, content, created_at FROM messages ORDER BY created_at ASC`.map(
			(row) => ({
				content: this.parseMessage(row.content),
				created_at: row.created_at,
				id: row.id,
				role: row.role,
				turn_id: row.turn_id,
			}),
		);
		const turns = this.sql<{ created_at: number; reply: string; turn_id: string }>`
			SELECT turn_id, reply, created_at FROM turns ORDER BY created_at ASC`.map((row) => ({
			created_at: row.created_at,
			outcome: this.parseTurnOutcome(row.reply),
			turn_id: row.turn_id,
		}));
		return {
			cart: this.cartLines(),
			checkout: this.checkout(),
			inbox,
			messages,
			meta: this.sql<{ key: string; value: string }>`SELECT key, value FROM meta ORDER BY key ASC`,
			outbox: this.sql<{ key: string; sent_at: number }>`
				SELECT key, sent_at FROM outbox ORDER BY sent_at ASC`,
			payments: this.sql<PaymentDbRow>`SELECT * FROM payments ORDER BY created_at ASC`,
			thread: this.name,
			turns,
		};
	}

	private messageText(content: string): string {
		const message = this.parseMessage(content);
		if (!Array.isArray(message.content)) {
			return message.content;
		}
		const texts = message.content.filter((part) => part.type === "text").map((part) => part.text);
		return texts.length > 0 ? texts.join(" ") : "";
	}

	// ─── Item processing ────────────────────────────────────────────────────

	private pendingRows(): Array<InboxRow> {
		const staleClaim = Date.now() - CLAIM_STALE_MS;
		return this.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at, attempts, turn_id FROM inbox
			WHERE status = 'pending'
				OR status = 'applied'
				OR (status = 'processing' AND claimed_at < ${staleClaim})
			ORDER BY seq ASC`;
	}

	// Flip rows to 'processing' before any await: DO sql calls are synchronous,
	// so this whole loop is atomic against a concurrent process() or an onStart
	// recovery in the same instance. 'applied' rows are re-claimable: their
	// mutation is done and only the resend is pending. attempts counts claims
	// so repeated failures can be detected. Only rows we actually claimed come
	// back, with their fresh attempt count.
	private claimRows(rows: Array<InboxRow>): Array<InboxRow> {
		const now = Date.now();
		const staleClaim = now - CLAIM_STALE_MS;
		const claimed: Array<InboxRow> = [];
		for (const row of rows) {
			const won = this.sql<{ attempts: number; event_id: string }>`
				UPDATE inbox SET status = 'processing', claimed_at = ${now}, attempts = attempts + 1
				WHERE event_id = ${row.event_id}
					AND (status = 'pending'
						OR status = 'applied'
						OR (status = 'processing' AND claimed_at < ${staleClaim}))
				RETURNING event_id, attempts`;
			if (won.length > 0 && won[0] !== undefined) {
				claimed.push({ ...row, attempts: won[0].attempts });
			}
		}
		return claimed;
	}

	// A failed turn leaves rows in 'processing'/'applied'; this schedule is the
	// retry. Arm once per claim; the tick re-runs processItems over whatever is
	// still unfinished.
	private async armRecovery(): Promise<void> {
		const pending = this.getSchedules().filter((s) => s.callback === "recoverInbox");
		if (pending.length === 0) {
			await this.schedule(this.recoverSeconds(), "recoverInbox", {});
		}
	}

	private recoverSeconds(): number {
		const raw = Number(this.env.INBOX_RECOVER_SECONDS ?? "120");
		return Number.isFinite(raw) && raw > 0 ? raw : 120;
	}

	async recoverInbox(): Promise<void> {
		const rows = this.pendingRows();
		if (rows.length > 0) {
			log({ event: "recover", rows: rows.length, thread: this.name ?? "" });
			await this.processItems(rows);
		}
		// A tick can fire while another processItems is still mid-turn: every
		// row it would retry is still 'processing', and the only schedule gets
		// consumed. If that turn then fails, nothing is armed. Re-arm whenever
		// unfinished rows remain so the next failure always has a follow-up.
		const unfinished = this.sql`
			SELECT event_id FROM inbox WHERE status IN ('pending', 'processing', 'applied') LIMIT 1`;
		if (unfinished.length > 0) {
			const pending = this.getSchedules().filter((s) => s.callback === "recoverInbox");
			for (const s of pending) {
				await this.cancelSchedule(s.id);
			}
			await this.schedule(this.recoverSeconds(), "recoverInbox", {});
		}
	}

	// The adapter keeps `platformMessageId` as the chat message id and the
	// Zernio internal id on `raw.id`; inbox rows key on the event id. Match on
	// the zernio message id inside the stored envelope.
	private findPendingRow(item: InboundItem): InboxRow | undefined {
		const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
		const zernioId = raw.success ? raw.output.id : undefined;
		const rows = this.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at, attempts, turn_id FROM inbox
			WHERE status = 'pending' ORDER BY seq ASC`;
		for (const row of rows) {
			const envelope = v.safeParse(zernioMessageEventSchema, JSON.parse(row.payload));
			if (!envelope.success) {
				continue;
			}
			const message = envelope.output.message;
			if (
				(zernioId !== undefined && message.id === zernioId) ||
				message.platformMessageId === item.id
			) {
				return row;
			}
		}
		return undefined;
	}

	private itemFromRow(row: InboxRow): InboundItem | undefined {
		const envelope = v.safeParse(zernioMessageEventSchema, JSON.parse(row.payload));
		if (!envelope.success) {
			return undefined;
		}
		const { message, metadata } = envelope.output;
		return normalizeInboundItem({
			attachments: message.attachments,
			id: message.platformMessageId ?? message.id ?? row.event_id,
			raw: { ...message, metadata: metadata ?? null },
			text: message.text ?? "",
		});
	}

	// DO entry points interleave at awaits: without this gate a second dispatch
	// can run a tap while an earlier turn is still mid-model, before that
	// turn's handoff pause lands. Rows arriving during a run stay pending and
	// get drained by the trailing pass below.
	private processing = false;

	private async processItems(rows: Array<InboxRow>): Promise<void> {
		if (this.processing) {
			return;
		}
		this.processing = true;
		try {
			const claimed = this.claimRows(rows);
			if (claimed.length === 0) {
				return;
			}
			await this.armRecovery();
			try {
				await this.runClaimed(claimed);
			} catch (error) {
				// Claimed rows carry the pre-flush turn_id (flush() tags them
				// later), so re-read it before the reset wipes 'processing'.
				const turnIds = new Set<string>();
				for (const row of claimed) {
					const current = this.sql<{ turn_id: string | null }>`
						SELECT turn_id FROM inbox WHERE event_id = ${row.event_id}`[0];
					if (current !== undefined && current.turn_id !== null) {
						turnIds.add(current.turn_id);
					}
				}
				turnFailedLog({
					attempts: Math.max(...claimed.map((r) => r.attempts)),
					error: errorFields(error),
					event_ids: claimed.map((r) => r.event_id),
					thread: this.name ?? "",
					turn_ids: [...turnIds],
				});
				// Rows still 'processing' go back to pending; the recovery
				// schedule retries them. 'applied' rows keep their status
				// (mutation done, resend pending) and are claimable as-is.
				for (const row of claimed) {
					void this
						.sql`UPDATE inbox SET status = 'pending', claimed_at = NULL WHERE event_id = ${row.event_id} AND status = 'processing'`;
				}
			}
		} finally {
			this.processing = false;
			// Drain whatever arrived while this run was in flight. Rows that
			// already failed an attempt wait for recoverInbox, so a short outage
			// doesn't burn every attempt in a tight loop.
			const leftover = this.pendingRows().filter((r) => r.attempts === 0);
			if (leftover.length > 0) {
				void this.processItems(leftover);
			}
		}
	}

	private async runClaimed(claimed: Array<InboxRow>): Promise<void> {
		const cutoff = Date.now() - REPROCESS_MAX_AGE_MS;
		const seqAtStart = this.latestSeq();

		// Strict arrival order: a tap or claim must not jump ahead of earlier
		// text. Pending model-bound items flush into their own deterministic
		// turn before each tap/claim executes.
		let items: Array<InboundItem> = [];
		let modelRows: Array<InboxRow> = [];
		const flush = async (): Promise<void> => {
			if (items.length === 0) {
				return;
			}
			const turnId = await this.turnIdFor(modelRows);
			// Tag the rows before the model call: on recovery the same turn_id
			// regroups them, so a replayed turn can't merge with new rows.
			for (const row of modelRows) {
				void this.sql`UPDATE inbox SET turn_id = ${turnId} WHERE event_id = ${row.event_id}`;
			}
			await this.respond({ items, rows: modelRows, seqAtStart, turnId });
			items = [];
			modelRows = [];
		};

		let handedOff = false;
		for (let i = 0; i < claimed.length; i++) {
			const row = claimed[i];
			if (row === undefined) {
				continue;
			}
			// Dead rows fail instead of silently dropping; the conversation
			// hands off once per batch.
			if (row.attempts >= MAX_ATTEMPTS || row.at < cutoff) {
				await flush();
				void this.sql`UPDATE inbox SET status = 'failed' WHERE event_id = ${row.event_id}`;
				if (!handedOff) {
					handedOff = true;
					await this.handoffToAdmin("bot_failed", `bot_failed:${row.event_id}`);
				}
				continue;
			}
			// A recovered turn's rows already carry turn_id: regroup them and
			// replay that turn (saved outcome) instead of merging into a new one.
			if (row.turn_id !== null) {
				const turnId = row.turn_id;
				const group: Array<InboxRow> = [];
				while (i < claimed.length && claimed[i]?.turn_id === turnId) {
					const grouped = claimed[i];
					if (grouped !== undefined) {
						group.push(grouped);
					}
					i++;
				}
				i--;
				await flush();
				await this.respond({
					items: group.flatMap((r) => {
						const item = this.itemFromRow(r);
						return item === undefined ? [] : [item];
					}),
					rows: group,
					seqAtStart,
					turnId,
				});
				continue;
			}
			// Pause is re-read per row: a handoff earlier in this batch or a
			// concurrent pause stops later taps from mutating anything.
			const action = this.classifyRow(row, this.isPaused());
			if (action.kind === "model") {
				items.push(action.item);
				modelRows.push(row);
				continue;
			}
			await flush();
			// classifyRow ran before the flushed turn above, so a pause that
			// turn's handoff set is only visible now. Taps are not claims:
			// paused means mark done without mutating.
			if (action.kind === "tap" && this.isPaused()) {
				this.markDone(row.event_id);
				continue;
			}
			await this.runRowAction(row, action);
			this.markDone(row.event_id);
		}
		await flush();
	}

	private async runRowAction(row: InboxRow, action: RowAction): Promise<void> {
		if (action.kind === "tap") {
			await this.handleTap(row, action.payload);
		} else if (action.kind === "claim") {
			await this.claimTransfer(row.event_id, action.paymentNumber);
		} else if (action.kind === "ambiguous") {
			await this.handoffToAdmin("payment_ambiguous", `${row.event_id}:ambiguous`);
		}
	}

	private isPaused(): boolean {
		const pausedUntil = Number(this.getMeta("paused_until") ?? "0");
		return Number.isFinite(pausedUntil) && pausedUntil > Date.now();
	}

	// Decides what a row is without executing side effects, so the caller can
	// flush pending model items before taps/claims run. While paused only
	// payment claims still act; everything else marks done silently.
	private classifyRow(row: InboxRow, paused: boolean): RowAction {
		const item = this.itemFromRow(row);
		if (item === undefined) {
			return { kind: "none" };
		}
		const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
		const metadata = raw.success ? raw.output.metadata : undefined;
		this.noteAdId(metadata);
		const tapPayload = metadata?.postbackPayload ?? metadata?.quickReplyPayload;
		if (tapPayload !== undefined) {
			const done = parseTransferDonePayload(tapPayload);
			if (done !== undefined) {
				return { kind: "claim", paymentNumber: done };
			}
			if (paused) {
				return { kind: "none" };
			}
			return { kind: "tap", payload: tapPayload };
		}
		const claim = this.classifyClaim(item);
		if (claim === "ambiguous") {
			return { kind: "ambiguous" };
		}
		if (claim !== undefined) {
			return { kind: "claim", paymentNumber: claim.paymentNumber };
		}
		if (paused) {
			return { kind: "none" };
		}
		return { item, kind: "model" };
	}

	// A free text ("хийсэн") or an image counts as a transfer claim only while
	// a pending payment exists — otherwise it's model input. An image counts
	// only once BANK_DETAILS went out (transfer_shown on some pending row), so
	// a product photo sent right after ordering isn't read as a receipt. With
	// more than one pending payment a claim can't be attributed: hand off.
	// transfer_done buttons name their payment and claim unconditionally.
	private classifyClaim(item: InboundItem): "ambiguous" | { paymentNumber: string } | undefined {
		const pendings = this.pendingPaymentRows();
		if (pendings.length === 0) {
			return undefined;
		}
		const qualifies =
			isTransferDoneText(item.text) ||
			((item.attachments ?? []).some(
				(a) => a.type === "image" && a.url !== undefined && a.url !== null,
			) &&
				pendings.some((p) => p.transfer_shown === 1));
		if (!qualifies) {
			return undefined;
		}
		const pending = pendings[0];
		if (pendings.length > 1 || pending === undefined) {
			return "ambiguous";
		}
		return { paymentNumber: pending.payment_number };
	}

	private async claimTransfer(key: string, paymentNumber: string): Promise<boolean> {
		const row = this.paymentByNumber(paymentNumber);
		if (row === undefined || row.status !== "pending") {
			this.tapLog("transfer_done", "no_pending", { payment_number: paymentNumber });
			return false;
		}
		await this.ensurePaymentWatch(paymentNumber);
		const store = storeClient(this.env);
		const ref = { checkoutToken: row.checkout_token ?? undefined, paymentNumber };
		await store.payment.claimTransferPaid.mutate(ref, { signal: withTimeout() });
		// selectTransfer restarts the reconciler window if it already ended;
		// ALREADY_PAID raced claims are harmless.
		await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
		void this.sql`UPDATE payments SET claimed = 1 WHERE payment_number = ${paymentNumber}`;
		await this.sendPart(`${key}:claim`, { message: CLAIM_ACK });
		this.tapLog("transfer_done", "claimed", { payment_number: paymentNumber });
		log({
			action: "claimed",
			claimed: 1,
			event: "payment",
			payment_number: paymentNumber,
			thread: this.name ?? "",
		});
		return true;
	}

	private noteAdId(
		metadata: { referral?: { ad_id?: string } | null | undefined } | null | undefined,
	): void {
		const adId = metadata?.referral?.ad_id;
		if (adId !== undefined && adId.length > 0 && this.getMeta("ad_id") === undefined) {
			this.setMeta("ad_id", adId);
		}
	}

	// ─── Taps ───────────────────────────────────────────────────────────────

	private async handleTap(row: InboxRow, payload: string): Promise<void> {
		const key = row.event_id;
		const done = parseTransferDonePayload(payload);
		if (done !== undefined) {
			await this.claimTransfer(key, done);
			return;
		}
		const payTransfer = parsePayTransferPayload(payload);
		if (payTransfer !== undefined) {
			await this.payTransferTap(key, payTransfer);
			return;
		}
		const confirm = parseOrderConfirmPayload(payload);
		if (confirm !== undefined) {
			await this.confirmTap(key, confirm);
			return;
		}
		const deliveryChange = parseDeliveryChangePayload(payload);
		if (deliveryChange !== undefined) {
			await this.deliveryChangeTap(row, deliveryChange);
			return;
		}
		const command = parseCartPayload(payload);
		if (command !== undefined) {
			await this.cartCommandTap(row, command);
			return;
		}
		const productId = parseOrderPayload(payload);
		if (productId !== undefined) {
			await this.orderProductTap(row, productId);
			return;
		}
		this.tapLog(payload, "unknown");
	}

	private async sendPart(key: string, body: Omit<ZernioSendBody, "accountId">): Promise<void> {
		if (this.outboxHas(key)) {
			return;
		}
		await send(
			this.env,
			this.conversationId(),
			{
				accountId: this.accountId(),
				...body,
			},
			key,
		);
		void this.sql`INSERT OR IGNORE INTO outbox (key, sent_at) VALUES (${key}, ${Date.now()})`;
	}

	private tapLog(kind: string, outcome: string, extra?: { payment_number?: string }): void {
		log({
			event: "tap",
			kind,
			outcome,
			payment_number: extra?.payment_number,
			thread: this.name ?? "",
		});
	}

	private async sendCartView(key: string): Promise<void> {
		const lines = this.cartLines();
		if (lines.length === 0) {
			await this.sendPart(key, { message: CART_EMPTY });
			return;
		}
		await this.sendPart(key, {
			message: formatCartSummary(lines),
			quickReplies: cartQuickReplies(lines),
		});
	}

	// CONFIRM_SUMMARY needs a full cart plus saved phone+address; anything
	// missing gets the corresponding fixed notice instead.
	private async sendConfirmOrNeed(key: string): Promise<void> {
		const lines = this.cartLines();
		const checkout = this.checkoutRow();
		if (lines.length === 0) {
			await this.sendPart(key, { message: CART_EMPTY });
			return;
		}
		if (checkout.phone === null || checkout.address === null) {
			await this.sendPart(key, { message: NEEDS_DELIVERY });
			return;
		}
		// Messenger collapses multi-line text into a truncated button template,
		// so the summary goes plain and the buttons ride a short second part.
		await this.sendPart(key, {
			message: formatConfirmSummary({
				address: checkout.address,
				items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
				note: checkout.note ?? undefined,
				phone: checkout.phone,
			}),
		});
		await this.sendPart(`${key}:btn`, {
			buttons: [
				{ payload: `order_confirm:${checkout.revision}`, title: "✅ Захиалах", type: "postback" },
				{
					payload: `delivery_change:${checkout.revision}`,
					title: "✏️ Хаяг солих",
					type: "postback",
				},
			],
			message: CONFIRM_PROMPT,
		});
	}

	private async sendOrderCreated(row: PaymentDbRow, key: string): Promise<void> {
		const qpay = buildQpayPageUrl(this.env.STORE_PUBLIC_URL ?? "https://amerikvitamin.mn", {
			checkoutToken: row.checkout_token,
			paymentNumber: row.payment_number,
		});
		await this.sendPart(key, {
			message: formatOrderCreated({
				countryside: row.countryside === 1,
				orderNumber: row.order_number,
				total: row.total,
			}),
		});
		await this.sendPart(`${key}:btn`, {
			buttons: [
				{ title: "QPay-р төлөх", type: "url", url: qpay },
				{
					payload: `pay_transfer:${row.payment_number}`,
					title: "Дансаар шилжүүлэх",
					type: "postback",
				},
			],
			message: PAY_PROMPT,
		});
	}

	// Mutating taps are exactly-once: the mutation, the revision bump and the
	// 'applied' flip happen in one synchronous block, so a send failure leaves
	// the row replayable without re-applying. A replayed 'applied' row only
	// re-sends the view under the same outbox key.
	private markApplied(eventId: string): void {
		void this.sql`UPDATE inbox SET status = 'applied' WHERE event_id = ${eventId}`;
	}

	private async orderProductTap(row: InboxRow, productId: number): Promise<void> {
		const key = row.event_id;
		if (row.status !== "applied") {
			let product: { name: string; price: number };
			try {
				const products = await storeClient(this.env).product.getProductsByIdsForAssistant.query(
					{ ids: [productId] },
					{ signal: withTimeout() },
				);
				const found = products.find((p) => p.id === productId);
				if (found === undefined) {
					throw new Error("product_not_found");
				}
				product = found;
			} catch (error) {
				this.tapLog("order_product", error instanceof Error ? error.message : "failed");
				await this.sendPart(`${key}:tap`, { message: ERROR });
				return;
			}
			// Mutation + revision + 'applied' in one synchronous block.
			const existing = this.sql<CartRow>`SELECT qty FROM cart WHERE product_id = ${productId}`[0];
			const qty = Math.min((existing?.qty ?? 0) + 1, 99);
			void this.sql`
				INSERT INTO cart (product_id, qty, name, price) VALUES (${productId}, ${qty}, ${product.name}, ${product.price})
				ON CONFLICT(product_id) DO UPDATE SET qty = ${qty}`;
			this.bumpRevision();
			this.markApplied(key);
		}
		await this.sendCartView(`${key}:tap`);
		this.tapLog("order_product", "added");
	}

	private async cartCommandTap(
		row: InboxRow,
		command: NonNullable<ReturnType<typeof parseCartPayload>>,
	): Promise<void> {
		const key = row.event_id;
		if (command.kind === "view") {
			await this.sendCartView(`${key}:tap`);
			this.tapLog("cart_view", "sent");
			return;
		}
		if (command.kind === "confirm") {
			await this.sendConfirmOrNeed(`${key}:tap`);
			this.tapLog("cart_confirm", "sent");
			return;
		}
		if (row.status !== "applied") {
			this.applyCartCommand(command);
			this.bumpRevision();
			this.markApplied(key);
		}
		await this.sendCartView(`${key}:tap`);
		this.tapLog(`cart_${command.kind}`, "applied");
	}

	private applyCartCommand(
		command: Exclude<
			NonNullable<ReturnType<typeof parseCartPayload>>,
			{ kind: "confirm" | "view" }
		>,
	): void {
		if (command.kind === "clear") {
			void this.sql`DELETE FROM cart`;
			return;
		}
		const row = this
			.sql<CartRow>`SELECT product_id, qty FROM cart WHERE product_id = ${command.productId}`[0];
		if (row === undefined) {
			return;
		}
		if (command.kind === "inc") {
			void this
				.sql`UPDATE cart SET qty = ${Math.min(row.qty + 1, 99)} WHERE product_id = ${command.productId}`;
			return;
		}
		if (command.kind === "dec") {
			if (row.qty <= 1) {
				void this.sql`DELETE FROM cart WHERE product_id = ${command.productId}`;
				return;
			}
			void this.sql`UPDATE cart SET qty = ${row.qty - 1} WHERE product_id = ${command.productId}`;
			return;
		}
		void this.sql`DELETE FROM cart WHERE product_id = ${command.productId}`;
	}

	// "✏️ Хаяг солих" clears saved delivery fields so the model asks again.
	// Mutating tap: same exactly-once pattern as cart commands.
	private async deliveryChangeTap(row: InboxRow, revision: number): Promise<void> {
		const key = row.event_id;
		if (row.status !== "applied") {
			if (revision !== this.checkoutRow().revision) {
				await this.sendPart(`${key}:tap`, { message: CART_CHANGED });
				await this.sendConfirmOrNeed(`${key}:confirm`);
				this.tapLog("delivery_change", "stale");
				return;
			}
			void this.sql`
				UPDATE checkout SET phone = NULL, address = NULL, note = NULL, countryside = 0
				WHERE id = 1`;
			this.bumpRevision();
			this.markApplied(key);
		}
		await this.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
		this.tapLog("delivery_change", "cleared");
	}

	private async confirmTap(key: string, revision: number): Promise<void> {
		const existing = this.paymentByRevision(revision);
		if (existing !== undefined) {
			await this.ensurePaymentWatch(existing.payment_number);
			await this.sendOrderCreated(existing, `${key}:order`);
			this.tapLog("order_confirm", "resent");
			return;
		}
		const checkout = this.checkoutRow();
		if (revision !== checkout.revision) {
			await this.sendPart(`${key}:tap`, { message: CART_CHANGED });
			await this.sendConfirmOrNeed(`${key}:confirm`);
			this.tapLog("order_confirm", "stale");
			return;
		}
		const lines = this.cartLines();
		if (lines.length === 0) {
			await this.sendPart(`${key}:tap`, { message: CART_EMPTY });
			this.tapLog("order_confirm", "empty");
			return;
		}
		if (checkout.phone === null || checkout.address === null) {
			await this.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
			this.tapLog("order_confirm", "needs_delivery");
			return;
		}
		await this.createOrder(key, checkout, lines);
	}

	private async createOrder(
		key: string,
		checkout: CheckoutRow,
		lines: Array<CartLine>,
	): Promise<void> {
		if (checkout.phone === null || checkout.address === null) {
			return;
		}
		try {
			const res = await storeClient(this.env).order.addOrder.mutate(
				{
					address: checkout.address,
					notes: checkout.note ?? undefined,
					phoneNumber: checkout.phone,
					products: lines.map((l) => ({ productId: l.productId, quantity: l.qty })),
				},
				{ signal: withTimeout() },
			);
			if (res.paymentNumber === null) {
				throw new Error("no_payment_number");
			}
			const now = Date.now();
			// addOrder can return an existing payment number (the store reuses a
			// matching pending checkout), so upsert instead of failing the whole
			// order on the payments PK.
			void this.sql`
				INSERT INTO payments
					(payment_number, order_number, revision, checkout_token, account_name, account_number,
					 total, phone, created_at, status, claimed, deadline, notified, handed_off, countryside)
				VALUES (${res.paymentNumber}, ${res.orderNumber}, ${checkout.revision}, ${res.checkoutToken},
					${res.accountName}, ${res.accountNumber}, ${res.total}, ${checkout.phone}, ${now},
					'pending', 0, ${now + PAYMENT_DEADLINE_MS}, 0, 0, ${checkout.countryside})
				ON CONFLICT(payment_number) DO UPDATE SET
					order_number = excluded.order_number,
					revision = excluded.revision,
					checkout_token = excluded.checkout_token,
					account_name = excluded.account_name,
					account_number = excluded.account_number,
					total = excluded.total,
					phone = excluded.phone,
					countryside = excluded.countryside`;
			void this.sql`DELETE FROM cart`;
			this.bumpRevision();
			const row = this.paymentByNumber(res.paymentNumber);
			if (row === undefined) {
				throw new Error("payment_row_missing");
			}
			await this.ensurePaymentWatch(res.paymentNumber);
			await this.sendOrderCreated(row, `${key}:order`);
			log({
				countryside: checkout.countryside === 1,
				event: "order",
				items: lines.length,
				order_number: res.orderNumber,
				outcome: "created",
				payment_number: res.paymentNumber,
				thread: this.name ?? "",
				total: res.total,
			});
		} catch (error) {
			logError({
				countryside: checkout.countryside === 1,
				error: errorFields(error),
				event: "order",
				items: lines.length,
				outcome: "error",
				thread: this.name ?? "",
			});
			await this.sendPart(`${key}:tap`, { message: ERROR });
		}
	}

	private async payTransferTap(key: string, paymentNumber: string): Promise<void> {
		const row = this.paymentByNumber(paymentNumber);
		if (row === undefined) {
			this.tapLog("pay_transfer", "unknown_payment");
			await this.sendPart(`${key}:tap`, { message: ERROR });
			return;
		}
		try {
			await storeClient(this.env).payment.selectTransfer.mutate(
				{
					checkoutToken: row.checkout_token ?? undefined,
					paymentNumber,
				},
				{ signal: withTimeout() },
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("ALREADY_PAID")) {
				await this.sendPart(`${key}:tap`, { message: ALREADY_PAID });
				this.tapLog("pay_transfer", "already_paid");
				return;
			}
			this.tapLog("pay_transfer", "select_failed");
			await this.sendPart(`${key}:tap`, { message: ERROR });
			return;
		}
		await this.sendPart(`${key}:tap`, {
			message: formatBankDetails({
				accountName: row.account_name ?? "",
				accountNumber: row.account_number ?? "",
				phone: row.phone,
				total: row.total,
			}),
		});
		await this.sendPart(`${key}:btn`, {
			buttons: [
				{
					payload: `transfer_done:${paymentNumber}`,
					title: "Шилжүүлсэн",
					type: "postback",
				},
			],
			message: TRANSFER_PROMPT,
		});
		// Bank details are on screen now: an image reply is a receipt.
		void this.sql`UPDATE payments SET transfer_shown = 1 WHERE payment_number = ${paymentNumber}`;
		this.tapLog("pay_transfer", "sent");
	}

	// ─── Handoff ────────────────────────────────────────────────────────────

	// Sends and the alert come before the pause: a crash between them replays
	// the handoff (outbox keys dedupe what landed). Pausing first would
	// instead drop the replayed turn at dispatchTurn's isPaused() and the
	// admin alert would be lost.
	private async handoffToAdmin(reason: string, sendKey: string): Promise<void> {
		await this.sendPart(sendKey, { message: HANDOFF });
		const alertKey = `${sendKey}:alert`;
		let alert: "already_sent" | "failed" | "not_configured" | "sent";
		let alertStatus: number | undefined;
		if (this.outboxHas(alertKey)) {
			alert = "already_sent";
		} else {
			// A thrown fetch error is a transport failure, not "unconfigured":
			// not_configured means the env has no token/chat ids at all.
			const result = await sendTelegramAlert(this.env, {
				reason,
				recentTexts: this.recentCustomerTexts(),
				threadId: this.name ?? "",
			}).catch(() => undefined);
			if (result === undefined) {
				alert = "failed";
			} else if (!result.ok) {
				// No status means the env has no token/chat ids at all.
				alert = result.status === undefined ? "not_configured" : "failed";
				alertStatus = result.status;
			} else {
				void this
					.sql`INSERT OR IGNORE INTO outbox (key, sent_at) VALUES (${alertKey}, ${Date.now()})`;
				alert = "sent";
			}
		}
		this.setMeta("paused_until", String(Date.now() + PAUSE_MS));
		const fields = {
			alert,
			alert_status: alertStatus,
			event: "handoff" as const,
			key: sendKey,
			reason,
			thread: this.name ?? "",
		};
		if (alert === "failed") {
			logError(fields);
		} else {
			log(fields);
		}
	}

	// ─── Model turn ─────────────────────────────────────────────────────────

	private async respond(opts: {
		items: Array<InboundItem>;
		rows: Array<InboxRow>;
		seqAtStart: number;
		turnId: string;
	}): Promise<void> {
		const { items, rows, seqAtStart, turnId } = opts;
		const started = Date.now();
		const thread = this.name ?? "";
		const attempt = Math.max(...rows.map((r) => r.attempts));

		// A saved outcome means this turn already ran the model; replay the
		// sends (outbox keys dedupe the ones that landed) instead of mixing a
		// second model answer into the same turn.
		const saved = this.turnOutcome(turnId);
		if (saved !== undefined) {
			await this.replayTurn({ attempt, items, rows, saved, started, thread, turnId });
			return;
		}

		await this.prefillDeliveryFromHistory();

		const { hadPhotos, persistedUserMessage, photoCount, text, userMessage } =
			await this.buildUserMessages(items);

		// A photo-only turn whose images all failed to fetch has nothing to
		// show the model: answer with the fixed resend prompt.
		if (text.length === 0 && hadPhotos && photoCount === 0) {
			this.persistTurn(turnId, persistedUserMessage, [], false);
			await this.sendPart(`${turnId}:text`, { message: IMAGE_UNREADABLE });
			this.finishTurn(rows);
			turnLog({
				attempt,
				conversation: this.conversationId(),
				handoff: false,
				inputs: items.length,
				model: modelName(this.env),
				outcome: "image_unreadable",
				photos: 0,
				product_ids: [],
				reply_text: IMAGE_UNREADABLE,
				step_ms: [],
				steps: 0,
				thread,
				tokens_cached: 0,
				tokens_in: 0,
				tokens_out: 0,
				tool_calls: [],
				tools: [],
				total_ms: Date.now() - started,
				turn_id: turnId,
			});
			return;
		}

		const messages: Array<ModelMessage> = [
			...this.historyByTurns(HISTORY_TURNS),
			this.stateMessage(await this.adProducts()),
			userMessage,
		];

		const env = this.env;
		const tools = createTools(env, this) satisfies ToolSet;
		const stepMs: Array<number> = [];
		let lastStepAt = Date.now();
		const result = await generateText({
			messages,
			model: createModel(env),
			onStepFinish: () => {
				const now = Date.now();
				stepMs.push(now - lastStepAt);
				lastStepAt = now;
			},
			// The last allowed step must answer or escalate: without this a long
			// list order spends every step on searches and the customer gets the
			// fallback. handoff stays available so complaints still reach admin.
			prepareStep: ({ stepNumber }) =>
				stepNumber === MAX_STEPS - 1
					? { activeTools: ["reply", "handoff"], toolChoice: "required" as const }
					: undefined,
			providerOptions,
			stopWhen: [hasToolCall("reply"), hasToolCall("handoff"), stepCountIs(MAX_STEPS)],
			system: SYSTEM_PROMPT,
			toolChoice: "required",
			tools,
		});

		const reply = this.extractReply(result);
		const handoffReason = this.extractHandoff(result);
		const superseded = this.latestSeq() > seqAtStart;
		// The validated outcome is stored before the first send; a retried turn
		// replays exactly this.
		this.saveTurnOutcome(turnId, { handoff: handoffReason, reply, superseded });
		this.persistTurn(turnId, persistedUserMessage, result.response.messages, superseded);
		const outcome = await this.dispatchTurn({
			handoffReason,
			reply,
			superseded,
			turnId,
		});

		this.finishTurn(rows);

		turnLog({
			action: reply?.action,
			ad_id: this.getMeta("ad_id"),
			attempt,
			conversation: this.conversationId(),
			handoff: handoffReason !== undefined,
			inputs: items.length,
			model: modelName(env),
			outcome,
			photos: photoCount,
			product_ids: reply?.productIds ?? [],
			reply_text: reply?.text,
			step_ms: stepMs,
			steps: result.steps.length,
			thread,
			tokens_cached: result.usage.cachedInputTokens ?? 0,
			tokens_in: result.usage.inputTokens ?? 0,
			tokens_out: result.usage.outputTokens ?? 0,
			tool_calls: result.steps.flatMap((s) =>
				s.toolCalls.map((c) => ({ input: c.input, name: c.toolName })),
			),
			tools: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
			total_ms: Date.now() - started,
			turn_id: turnId,
		});
	}

	// Replays a turn whose validated outcome is already in `turns`: dispatch
	// the saved reply/handoff (outbox keys dedupe sends that landed) and log
	// the replay instead of running the model a second time.
	private async replayTurn(opts: {
		attempt: number;
		items: Array<InboundItem>;
		rows: Array<InboxRow>;
		saved: TurnOutcome;
		started: number;
		thread: string;
		turnId: string;
	}): Promise<void> {
		const { attempt, items, rows, saved, started, thread, turnId } = opts;
		const outcome = await this.dispatchTurn({
			handoffReason: saved.handoff,
			reply: saved.reply,
			superseded: saved.superseded ?? false,
			turnId,
		});
		this.finishTurn(rows);
		turnLog({
			ad_id: this.getMeta("ad_id"),
			attempt,
			conversation: this.conversationId(),
			handoff: saved.handoff !== undefined,
			inputs: items.length,
			model: modelName(this.env),
			outcome,
			photos: 0,
			product_ids: saved.reply?.productIds ?? [],
			replayed: true,
			reply_text: saved.reply?.text,
			step_ms: [],
			steps: 0,
			thread,
			tokens_cached: 0,
			tokens_in: 0,
			tokens_out: 0,
			tool_calls: [],
			tools: [],
			total_ms: Date.now() - started,
			turn_id: turnId,
		});
	}

	// Mark the turn's rows done: synchronous, so no await can wedge between
	// the last send and the status flip.
	private finishTurn(rows: Array<InboxRow>): void {
		for (const row of rows) {
			this.markDone(row.event_id);
		}
	}

	private turnOutcome(turnId: string): TurnOutcome | undefined {
		const row = this.sql<{ reply: string }>`
			SELECT reply FROM turns WHERE turn_id = ${turnId}`[0];
		return row === undefined ? undefined : this.parseTurnOutcome(row.reply);
	}

	private parseTurnOutcome(reply: string): TurnOutcome {
		// SAFETY: `reply` is written only by saveTurnOutcome below, which stores
		// JSON.stringify(TurnOutcome).
		return JSON.parse(reply) as TurnOutcome;
	}

	private saveTurnOutcome(turnId: string, outcome: TurnOutcome): void {
		void this.sql`
			INSERT OR IGNORE INTO turns (turn_id, reply, created_at)
			VALUES (${turnId}, ${JSON.stringify(outcome)}, ${Date.now()})`;
	}

	// Build the model-facing user message: text lines from every merged item
	// plus fetched image parts. History must not carry image bytes, so the
	// persisted variant swaps each image part for a short placeholder.
	private async buildUserMessages(items: Array<InboundItem>): Promise<{
		hadPhotos: boolean;
		persistedUserMessage: ModelMessage;
		photoCount: number;
		text: string;
		userMessage: ModelMessage;
	}> {
		const text = items
			.map((i) => i.text)
			.filter((t) => t.length > 0)
			.join("\n");
		const hadPhotos = items.some((i) => (i.attachments ?? []).some((a) => a.type === "image"));
		const imageParts = (
			await Promise.all(items.map((i) => fetchImageParts(this.env, i.attachments ?? [])))
		).flat();
		const userParts: Array<ImagePart | TextPart> = [
			...(text.length > 0 ? [{ text, type: "text" as const }] : []),
			...imageParts,
		];
		return {
			hadPhotos,
			persistedUserMessage: {
				content: userParts.map((part) =>
					part.type === "image" ? { text: "[зураг]", type: "text" as const } : part,
				),
				role: "user",
			},
			photoCount: imageParts.length,
			text,
			userMessage: { content: userParts, role: "user" },
		};
	}

	// Products named by the ad that opened this chat. The ad's ids are looked up
	// once and cached in meta ("" when the ad names none); product details are
	// read fresh each turn so price and stock stay current. Any failure just
	// means a normal reply.
	private async adProducts() {
		const adId = this.getMeta("ad_id");
		if (adId === undefined) {
			return [];
		}
		try {
			let cached = this.getMeta("ad_product_ids");
			if (cached === undefined) {
				cached = (await adProductIds(this.env, adId)).join(",");
				this.setMeta("ad_product_ids", cached);
			}
			const ids = cached
				.split(",")
				.filter((id) => id.length > 0)
				.map(Number);
			if (ids.length === 0) {
				return [];
			}
			return await storeClient(this.env).product.getProductsByIdsForAssistant.query(
				{ ids },
				{ signal: withTimeout() },
			);
		} catch (error) {
			logError({
				error: errorFields(error),
				event: "error",
				thread: this.name ?? "",
				where: "ad_products",
			});
			return [];
		}
	}

	private stateMessage(adProducts: Parameters<typeof stateNote>[0]["adProducts"]): ModelMessage {
		const checkout = this.checkout();
		const payment = this.latestPayment();
		return {
			content: stateNote({
				address: checkout.address,
				adProducts,
				cartLines: this.cartLines().map((l) => ({ name: l.name, qty: l.qty })),
				countryside: checkout.countryside,
				note: checkout.note,
				orderNumber: payment?.orderNumber,
				paymentStatus: payment?.status,
				phone: checkout.phone,
			}),
			role: "user",
		};
	}

	// Whole turns only: user + assistant/tool messages saved under one turn_id
	// so history replay never splits a call from its result. A superseded turn
	// keeps only the user message — saving its assistant side would make the
	// next turn think it already answered.
	private persistTurn(
		turnId: string,
		persistedUserMessage: ModelMessage,
		responseMessages: Array<ModelMessage>,
		superseded: boolean,
	): void {
		const created = Date.now();
		this.saveTurn(turnId, 0, persistedUserMessage, created);
		if (!superseded) {
			for (const [i, message] of responseMessages.entries()) {
				this.saveTurn(turnId, i + 1, message, created + i + 1);
			}
		}
	}

	// Sends after the model run. Handoff wins over reply; a superseded turn
	// sends nothing. Pause is re-read right before sending: a handoff in the
	// same batch or a concurrent pause drops the reply rather than answering
	// after the bot was stopped.
	private async dispatchTurn(opts: {
		handoffReason: string | undefined;
		reply: ReplyResult | undefined;
		superseded: boolean;
		turnId: string;
	}): Promise<string> {
		const { handoffReason, reply, superseded, turnId } = opts;
		if (superseded) {
			return "superseded";
		}
		if (this.isPaused()) {
			return "paused_drop";
		}
		if (handoffReason !== undefined) {
			await this.handoffToAdmin(handoffReason, `${turnId}:handoff`);
			return "handoff";
		}
		await this.sendReply({ env: this.env, reply, turnId });
		if (reply?.action === "show_cart") {
			await this.sendCartView(`${turnId}:cart`);
		} else if (reply?.action === "confirm_order") {
			await this.sendConfirmOrNeed(`${turnId}:confirm`);
		}
		return reply === undefined ? "no_reply" : "sent";
	}

	private async sendReply(opts: {
		env: Env;
		reply: ReplyResult | undefined;
		turnId: string;
	}): Promise<void> {
		const { env, reply, turnId } = opts;
		// A render/send failure propagates to processItems, whose error turn
		// log carries the error fields — nothing extra to record here.
		await renderTurn({
			accountId: this.accountId(),
			conversationId: this.conversationId(),
			env,
			hasSent: (key: string) => this.outboxHas(key),
			markSent: (key: string) =>
				void this.sql`INSERT OR IGNORE INTO outbox (key, sent_at) VALUES (${key}, ${Date.now()})`,
			reply: reply ?? { text: FALLBACK_TEXT },
			turnId,
		});
	}

	private extractReply(result: {
		steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>;
	}): ReplyResult | undefined {
		for (const step of [...result.steps].reverse()) {
			for (const call of [...step.toolCalls].reverse()) {
				if (call.toolName === "reply") {
					const parsed = v.safeParse(replyInputSchema, call.input);
					if (parsed.success) {
						return parsed.output;
					}
				}
			}
		}
		return undefined;
	}

	private extractHandoff(result: {
		steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>;
	}): string | undefined {
		for (const step of [...result.steps].reverse()) {
			for (const call of [...step.toolCalls].reverse()) {
				if (call.toolName === "handoff") {
					const parsed = v.safeParse(v.object({ reason: v.string() }), call.input);
					return parsed.success ? parsed.output.reason : "unspecified";
				}
			}
		}
		return undefined;
	}

	private historyByTurns(count: number): Array<ModelMessage> {
		const rows = this.sql<{ content: string; turn_id: string }>`
			SELECT content, turn_id FROM messages
			WHERE turn_id IN (
				SELECT turn_id FROM messages
				GROUP BY turn_id ORDER BY MAX(created_at) DESC LIMIT ${count}
			)
			ORDER BY created_at ASC`;
		return rows.map((r) => this.parseMessage(r.content));
	}

	private parseMessage(content: string): ModelMessage {
		// SAFETY: `content` is written only by saveTurn below, which
		// JSON.stringify()s a ModelMessage.
		return JSON.parse(content) as ModelMessage;
	}

	private saveTurn(turnId: string, index: number, message: ModelMessage, at: number): void {
		// Deterministic ids: a retried persistTurn INSERT OR IGNOREs onto the
		// same rows instead of duplicating history.
		void this.sql`
			INSERT OR IGNORE INTO messages (id, turn_id, role, content, created_at)
			VALUES (${`${turnId}:${index}`}, ${turnId}, ${message.role}, ${JSON.stringify(message)}, ${at})`;
	}

	// Deterministic turn id from the claimed inbox rows: a re-processed turn
	// (crash, eviction, stale claim) hashes the same event ids, so its outbox
	// keys and Zernio Idempotency-Keys match the first attempt and already-sent
	// parts are skipped instead of double-posted.
	private async turnIdFor(rows: Array<InboxRow>): Promise<string> {
		const ids = rows
			.map((r) => r.event_id)
			.sort()
			.join(",");
		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ids));
		const hex = Array.from(new Uint8Array(digest).slice(0, 6), (b) =>
			b.toString(16).padStart(2, "0"),
		).join("");
		return `t_${hex}`;
	}

	// ─── Storage ────────────────────────────────────────────────────────────

	private ensureCheckout(): void {
		void this.sql`INSERT OR IGNORE INTO checkout (id, revision) VALUES (1, 0)`;
	}

	private checkoutRow(): CheckoutRow {
		this.ensureCheckout();
		const row = this.sql<CheckoutRow>`SELECT * FROM checkout WHERE id = 1`[0];
		if (row === undefined) {
			throw new Error("checkout row missing");
		}
		return row;
	}

	private bumpRevision(): void {
		this.ensureCheckout();
		void this.sql`UPDATE checkout SET revision = revision + 1 WHERE id = 1`;
	}

	private paymentByNumber(paymentNumber: string): PaymentDbRow | undefined {
		return this.sql<PaymentDbRow>`
			SELECT * FROM payments WHERE payment_number = ${paymentNumber}`[0];
	}

	private paymentByRevision(revision: number): PaymentDbRow | undefined {
		return this.sql<PaymentDbRow>`SELECT * FROM payments WHERE revision = ${revision}`[0];
	}

	private pendingPaymentRows(): Array<PaymentDbRow> {
		return this.sql<PaymentDbRow>`
			SELECT * FROM payments WHERE status = 'pending' ORDER BY created_at DESC`;
	}

	private markDone(eventId: string): void {
		void this.sql`UPDATE inbox SET status = 'done' WHERE event_id = ${eventId}`;
	}

	private latestSeq(): number {
		const raw = this.getMeta("latest_seq");
		const seq = Number(raw ?? "0");
		return Number.isFinite(seq) ? seq : 0;
	}

	private outboxHas(key: string): boolean {
		return this.sql<{ key: string }>`SELECT key FROM outbox WHERE key = ${key}`.length > 0;
	}

	private getMeta(key: string): string | undefined {
		return this.sql<{ value: string }>`SELECT value FROM meta WHERE key = ${key}`[0]?.value;
	}

	private setMeta(key: string, value: string): void {
		void this.sql`INSERT OR REPLACE INTO meta (key, value) VALUES (${key}, ${value})`;
	}

	// this.name is the thread id "zernio:{accountId}:{conversationId}" — the
	// conversation id is everything after the second colon.
	private conversationId(): string {
		const name = this.name ?? "";
		return name.slice(name.indexOf(":", "zernio:".length) + 1);
	}

	private accountId(): string {
		const name = this.name ?? "";
		return name.slice("zernio:".length, name.indexOf(":", "zernio:".length));
	}
}
