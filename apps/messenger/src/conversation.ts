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
	parseOrderConfirmPayload,
	parseOrderPayload,
	parsePayTransferPayload,
	parseTransferDonePayload,
	buildQpayPageUrl,
	type CartLine,
} from "./cart";
import {
	ALREADY_PAID,
	CART_CHANGED,
	CART_EMPTY,
	CLAIM_ACK,
	ERROR,
	formatBankDetails,
	formatConfirmSummary,
	formatOrderCreated,
	formatPaid,
	HANDOFF,
	IMAGE_UNREADABLE,
	NEEDS_DELIVERY,
} from "./copy";
import type { Env } from "./env";
import { turnLog } from "./log";
import { createModel, modelName, providerOptions } from "./model";
import { fetchImageParts } from "./photos";
import { stateNote, SYSTEM_PROMPT } from "./prompt";
import { renderTurn } from "./render";
import { storeClient, withTimeout } from "./store";
import { sendTelegramAlert } from "./telegram";
import { createTools, replyInputSchema, type CheckoutState, type ReplyResult } from "./tools";
import { send, type ZernioSendBody } from "./zernio";

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
				note TEXT
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
				transfer_shown INTEGER NOT NULL DEFAULT 0
			)`;

		const pending = this.pendingRows();
		if (pending.length > 0) {
			this.ctx.waitUntil(this.processItems(pending));
		}
		// A watcher job consumed mid-crash would never re-arm on its own.
		// After a restart every still-watched payment gets exactly one tick.
		const watched = this.sql<{ payment_number: string }>`
			SELECT payment_number FROM payments
			WHERE notified = 0 AND status IN ('pending', 'claimed')
				AND created_at > ${Date.now() - PAYMENT_WATCH_END_MS}`;
		for (const p of watched) {
			this.ctx.waitUntil(this.armWatcher(p.payment_number));
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
		return { inserted: true };
	}

	async process(items: Array<InboundItem>): Promise<void> {
		const parsed = v.safeParse(inboundItemsSchema, items);
		if (!parsed.success) {
			console.error("[conversation.process] bad items", parsed.issues);
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

	// Payment watcher. Scheduled on order creation, reschedules itself while the
	// payment stays pending: every `watchSeconds` until the 2h deadline, then a
	// slower tick until 24h after creation, then it stops. Survives DO evictions
	// through the agents alarm table.
	async checkPayment(payload: { paymentNumber: string }): Promise<void> {
		const parsed = v.safeParse(checkPaymentSchema, payload);
		if (!parsed.success) {
			return;
		}
		const { paymentNumber } = parsed.output;
		const row = this.paymentByNumber(paymentNumber);
		if (row === undefined || row.notified === 1) {
			return;
		}
		if (Date.now() > row.created_at + PAYMENT_WATCH_END_MS) {
			return;
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
			// status stays "error"; the next tick retries.
		}
		console.log(JSON.stringify({ event: "payment_check", paymentNumber, status }));
		if (status === "success") {
			void this.sql`UPDATE payments SET status = 'success' WHERE payment_number = ${paymentNumber}`;
			// notified flips only after the paid message actually went out, so a
			// failed send is retried on the next tick instead of lost.
			try {
				await this.sendPart(`pay_${paymentNumber}:paid`, {
					message: formatPaid(row.created_at),
				});
				void this.sql`UPDATE payments SET notified = 1 WHERE payment_number = ${paymentNumber}`;
			} catch {
				await this.armWatcher(paymentNumber);
			}
			return;
		}
		if (status === PAYMENT_TERMINAL_FAIL) {
			void this.sql`UPDATE payments SET status = 'failed' WHERE payment_number = ${paymentNumber}`;
			return;
		}
		if (row.claimed === 1 && row.handed_off === 0) {
			const recon = await this.reconciliationStatus(row);
			if (recon !== undefined && RECON_FAIL_STATES.has(recon)) {
				void this.sql`UPDATE payments SET handed_off = 1 WHERE payment_number = ${paymentNumber}`;
				await this.handoffToAdmin("payment_unmatched", `pay_${paymentNumber}:handoff`);
			}
		}
		await this.armWatcher(paymentNumber);
	}

	private watchSeconds(): number {
		const raw = Number(this.env.PAYMENT_WATCH_SECONDS ?? "60");
		return Number.isFinite(raw) && raw > 0 ? raw : 60;
	}

	private slowWatchSeconds(): number {
		const raw = Number(this.env.PAYMENT_WATCH_SLOW_SECONDS ?? "900");
		return Number.isFinite(raw) && raw > 0 ? raw : 900;
	}

	// The currently-executing schedule still shows in getSchedules while the
	// callback runs, so "skip if one exists" can never arm a tick. Cancel every
	// pending checkPayment for this payment, then arm the next one: the
	// invariant is exactly one pending schedule per payment.
	private async armWatcher(paymentNumber: string): Promise<void> {
		const pendingSchedules = this.getSchedules<{ paymentNumber: string }>().filter(
			(s) => s.callback === "checkPayment" && s.payload?.paymentNumber === paymentNumber,
		);
		for (const s of pendingSchedules) {
			await this.cancelSchedule(s.id);
		}
		const row = this.paymentByNumber(paymentNumber);
		const slow = row !== undefined && Date.now() >= row.deadline;
		await this.schedule(slow ? this.slowWatchSeconds() : this.watchSeconds(), "checkPayment", {
			paymentNumber,
		});
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

	saveDelivery(input: { address?: string; note?: string; phone?: string }): void {
		this.ensureCheckout();
		const current = this.checkoutRow();
		void this.sql`
			UPDATE checkout SET
				phone = ${input.phone ?? current.phone},
				address = ${input.address ?? current.address},
				note = ${input.note ?? current.note}
			WHERE id = 1`;
		this.bumpRevision();
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
		return {
			attachments: message.attachments,
			id: message.platformMessageId ?? message.id ?? row.event_id,
			raw: { ...message, metadata: metadata ?? null },
			text: message.text ?? "",
		};
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
				console.error("[conversation.processItems]", error);
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
			console.log(JSON.stringify({ event: "tap", kind: "transfer_done", outcome: "no_pending" }));
			return false;
		}
		const store = storeClient(this.env);
		const ref = { checkoutToken: row.checkout_token ?? undefined, paymentNumber };
		await store.payment.claimTransferPaid.mutate(ref, { signal: withTimeout() });
		// selectTransfer restarts the reconciler window if it already ended;
		// ALREADY_PAID raced claims are harmless.
		await store.payment.selectTransfer.mutate(ref, { signal: withTimeout() }).catch(() => {});
		void this.sql`UPDATE payments SET claimed = 1 WHERE payment_number = ${paymentNumber}`;
		await this.sendPart(`${key}:claim`, { message: CLAIM_ACK });
		console.log(JSON.stringify({ event: "tap", kind: "transfer_done", outcome: "claimed" }));
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
		console.log(JSON.stringify({ event: "tap", kind: payload, outcome: "unknown" }));
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

	private tapLog(kind: string, outcome: string): void {
		console.log(JSON.stringify({ event: "tap", kind, outcome }));
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
		await this.sendPart(key, {
			buttons: [
				{ payload: `order_confirm:${checkout.revision}`, title: "✅ Захиалах", type: "postback" },
			],
			message: formatConfirmSummary({
				address: checkout.address,
				items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
				note: checkout.note ?? undefined,
				phone: checkout.phone,
			}),
		});
	}

	private sendOrderCreated(row: PaymentDbRow, key: string): Promise<void> {
		const qpay = buildQpayPageUrl(this.env.STORE_PUBLIC_URL ?? "https://amerikvitamin.mn", {
			checkoutToken: row.checkout_token,
			paymentNumber: row.payment_number,
		});
		return this.sendPart(key, {
			buttons: [
				{ title: "QPay-р төлөх", type: "url", url: qpay },
				{
					payload: `pay_transfer:${row.payment_number}`,
					title: "Дансаар шилжүүлэх",
					type: "postback",
				},
			],
			message: formatOrderCreated({
				createdAtMs: row.created_at,
				orderNumber: row.order_number,
				total: row.total,
			}),
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

	private async confirmTap(key: string, revision: number): Promise<void> {
		const existing = this.paymentByRevision(revision);
		if (existing !== undefined) {
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
					 total, phone, created_at, status, claimed, deadline, notified, handed_off)
				VALUES (${res.paymentNumber}, ${res.orderNumber}, ${checkout.revision}, ${res.checkoutToken},
					${res.accountName}, ${res.accountNumber}, ${res.total}, ${checkout.phone}, ${now},
					'pending', 0, ${now + PAYMENT_DEADLINE_MS}, 0, 0)
				ON CONFLICT(payment_number) DO UPDATE SET
					order_number = excluded.order_number,
					revision = excluded.revision,
					checkout_token = excluded.checkout_token,
					account_name = excluded.account_name,
					account_number = excluded.account_number,
					total = excluded.total,
					phone = excluded.phone`;
			void this.sql`DELETE FROM cart`;
			this.bumpRevision();
			const row = this.paymentByNumber(res.paymentNumber);
			if (row === undefined) {
				throw new Error("payment_row_missing");
			}
			await this.armWatcher(res.paymentNumber);
			await this.sendOrderCreated(row, `${key}:order`);
			this.tapLog("order_confirm", "created");
		} catch (error) {
			this.tapLog("order_confirm", error instanceof Error ? `error:${error.message}` : "error");
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
			buttons: [
				{
					payload: `transfer_done:${paymentNumber}`,
					title: "Шилжүүлсэн",
					type: "postback",
				},
			],
			message: formatBankDetails({
				accountName: row.account_name ?? "",
				accountNumber: row.account_number ?? "",
				phone: row.phone,
				total: row.total,
			}),
		});
		// Bank details are on screen now: an image reply is a receipt.
		void this.sql`UPDATE payments SET transfer_shown = 1 WHERE payment_number = ${paymentNumber}`;
		this.tapLog("pay_transfer", "sent");
	}

	// ─── Handoff ────────────────────────────────────────────────────────────

	private async handoffToAdmin(reason: string, sendKey: string): Promise<void> {
		this.setMeta("paused_until", String(Date.now() + PAUSE_MS));
		await this.sendPart(sendKey, { message: HANDOFF });
		const result = await sendTelegramAlert(this.env, {
			reason,
			recentTexts: this.recentCustomerTexts(),
			threadId: this.name ?? "",
		}).catch(() => ({ ok: false, status: undefined }));
		if (!result.ok) {
			console.error(
				JSON.stringify({ event: "telegram_alert_failed", status: result.status ?? null }),
			);
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

		// A saved outcome means this turn already ran the model; replay the
		// sends (outbox keys dedupe the ones that landed) instead of mixing a
		// second model answer into the same turn.
		const saved = this.turnOutcome(turnId);
		if (saved !== undefined) {
			const outcome = await this.dispatchTurn({
				handoffReason: saved.handoff,
				reply: saved.reply,
				superseded: saved.superseded ?? false,
				turnId,
			});
			this.finishTurn(rows);
			turnLog({
				ad_id: this.getMeta("ad_id"),
				conversation: this.conversationId(),
				handoff: saved.handoff !== undefined,
				inputs: items.length,
				model: modelName(this.env),
				outcome,
				photos: 0,
				product_ids: saved.reply?.productIds ?? [],
				replayed: true,
				step_ms: [],
				steps: 0,
				tokens_cached: 0,
				tokens_in: 0,
				tokens_out: 0,
				tools: [],
				total_ms: Date.now() - started,
			});
			return;
		}

		const { hadPhotos, persistedUserMessage, photoCount, text, userMessage } =
			await this.buildUserMessages(items);

		// A photo-only turn whose images all failed to fetch has nothing to
		// show the model: answer with the fixed resend prompt.
		if (text.length === 0 && hadPhotos && photoCount === 0) {
			this.persistTurn(turnId, persistedUserMessage, [], false);
			await this.sendPart(`${turnId}:text`, { message: IMAGE_UNREADABLE });
			this.finishTurn(rows);
			turnLog({
				conversation: this.conversationId(),
				handoff: false,
				inputs: items.length,
				model: modelName(this.env),
				outcome: "image_unreadable",
				photos: 0,
				product_ids: [],
				step_ms: [],
				steps: 0,
				tokens_cached: 0,
				tokens_in: 0,
				tokens_out: 0,
				tools: [],
				total_ms: Date.now() - started,
			});
			return;
		}

		const messages: Array<ModelMessage> = [
			...this.historyByTurns(HISTORY_TURNS),
			this.stateMessage(),
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
			conversation: this.conversationId(),
			handoff: handoffReason !== undefined,
			inputs: items.length,
			model: modelName(env),
			outcome,
			photos: photoCount,
			product_ids: reply?.productIds ?? [],
			step_ms: stepMs,
			steps: result.steps.length,
			tokens_cached: result.usage.cachedInputTokens ?? 0,
			tokens_in: result.usage.inputTokens ?? 0,
			tokens_out: result.usage.outputTokens ?? 0,
			tools: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
			total_ms: Date.now() - started,
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
		if (row === undefined) {
			return undefined;
		}
		// SAFETY: `reply` is written only by saveTurnOutcome below, which stores
		// JSON.stringify(TurnOutcome).
		return JSON.parse(row.reply) as TurnOutcome;
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

	private stateMessage(): ModelMessage {
		const checkout = this.checkout();
		const payment = this.latestPayment();
		return {
			content: stateNote({
				address: checkout.address,
				cartLines: this.cartLines().map((l) => ({ name: l.name, qty: l.qty })),
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
		try {
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
		} catch (error) {
			console.error("[render.failed]", error);
			throw error;
		}
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
