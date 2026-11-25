import type { Agent } from "agents";
import type { ModelMessage } from "ai";
import * as v from "valibot";

import { zernioMessageEventSchema } from "./admit";
import type { CartLine } from "./cart";
import type { Env } from "./env";
import type { DeliveryPatch, PaymentAction, ReplyResult } from "./tools";

export const CLAIM_STALE_MS = 90_000;
export const CART_TTL_MS = 24 * 60 * 60_000;
export const PAYMENT_WATCH_END_MS = 7 * 24 * 60 * 60_000;
export const WINDOW_23H_MS = 23 * 60 * 60_000;
export const CONFIRM_TEXT_TTL_MS = 30 * 60_000;

export type TurnOutcome = {
	handoff?: string;
	handoffMessage?: string;
	payment?: PaymentAction;
	reply?: ReplyResult;
	superseded?: boolean;
};

export type InboxRow = {
	at: number;
	attempts: number;
	claimed_at: number | null;
	event_id: string;
	payload: string;
	seq: number;
	status: string;
	turn_id: string | null;
};

// Unified domain shapes mapped once at the SQLite boundary.
export type Checkout = {
	address?: string;
	countryside: boolean;
	note?: string;
	phone?: string;
	revision: number;
};

export type Payment = {
	accountName: string;
	accountNumber: string;
	checkoutToken?: string;
	claimed: boolean;
	countryside: boolean;
	createdAt: number;
	deadline: number;
	deliveredAt?: number;
	orderNumber: string;
	paymentNumber: string;
	phone: string;
	receiptAmount?: number;
	receiptUrl?: string;
	revision: number;
	status: string;
	total: number;
};

type CartDbRow = { added_at: number; name: string; price: number; product_id: number; qty: number };
type CheckoutDbRow = {
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
	delivered_at: number | null;
	order_number: string;
	payment_number: string;
	phone: string;
	receipt_amount: number | null;
	receipt_url: string | null;
	revision: number;
	status: string;
	total: number;
};

const toCartLine = (r: CartDbRow): CartLine => ({
	name: r.name,
	price: r.price,
	productId: r.product_id,
	qty: r.qty,
});

const toCheckout = (r: CheckoutDbRow): Checkout => ({
	address: r.address ?? undefined,
	countryside: r.countryside === 1,
	note: r.note ?? undefined,
	phone: r.phone ?? undefined,
	revision: r.revision,
});

const toPayment = (r: PaymentDbRow): Payment => ({
	accountName: r.account_name ?? "",
	accountNumber: r.account_number ?? "",
	checkoutToken: r.checkout_token ?? undefined,
	claimed: r.claimed === 1,
	countryside: r.countryside === 1,
	createdAt: r.created_at,
	deadline: r.deadline,
	deliveredAt: r.delivered_at ?? undefined,
	orderNumber: r.order_number,
	paymentNumber: r.payment_number,
	phone: r.phone,
	receiptAmount: r.receipt_amount ?? undefined,
	receiptUrl: r.receipt_url ?? undefined,
	revision: r.revision,
	status: r.status,
	total: r.total,
});

// Durable Object SQLite repository for one Messenger conversation.
// Keeps only domain facts on rows; outbound send/skip dedupe lives in `outbox`.
export class ConversationStore {
	private readonly agent: Agent<Env>;

	constructor(agent: Agent<Env>) {
		this.agent = agent;
	}

	migrate(): void {
		void this.agent.sql`
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
		void this.agent.sql`
			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				turn_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`;
		void this.agent
			.sql`CREATE TABLE IF NOT EXISTS outbox (key TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)`;
		void this.agent.sql`
			CREATE TABLE IF NOT EXISTS turns (
				turn_id TEXT PRIMARY KEY,
				reply TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`;
		void this.agent.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`;
		void this.agent.sql`CREATE TABLE IF NOT EXISTS seen (product_id INTEGER PRIMARY KEY)`;
		void this.agent.sql`
			CREATE TABLE IF NOT EXISTS cart (
				product_id INTEGER PRIMARY KEY,
				qty INTEGER NOT NULL,
				name TEXT NOT NULL,
				price INTEGER NOT NULL,
				added_at INTEGER NOT NULL DEFAULT 0
			)`;
		void this.agent.sql`
			CREATE TABLE IF NOT EXISTS checkout (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				revision INTEGER NOT NULL DEFAULT 0,
				phone TEXT,
				address TEXT,
				note TEXT,
				countryside INTEGER NOT NULL DEFAULT 0
			)`;
		void this.agent.sql`
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
				countryside INTEGER NOT NULL DEFAULT 0,
				delivered_at INTEGER,
				receipt_url TEXT,
				receipt_amount INTEGER
			)`;

		this.migrateExistingTables();
	}

	private migrateExistingTables(): void {
		const hasShown =
			this.agent.sql<{ name: string }>`
				SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shown'`.length > 0;
		if (hasShown) {
			void this.agent.sql`INSERT OR IGNORE INTO seen (product_id) SELECT product_id FROM shown`;
		}
		const hasCol = (table: string, col: string) =>
			this.agent.sql<{ name: string }>`SELECT name FROM pragma_table_info(${table})`.some(
				(c) => c.name === col,
			);
		if (!hasCol("checkout", "countryside")) {
			void this.agent.sql`ALTER TABLE checkout ADD COLUMN countryside INTEGER NOT NULL DEFAULT 0`;
		}
		if (!hasCol("cart", "added_at")) {
			void this.agent.sql`ALTER TABLE cart ADD COLUMN added_at INTEGER NOT NULL DEFAULT 0`;
		}
		if (!hasCol("payments", "countryside")) {
			void this.agent.sql`ALTER TABLE payments ADD COLUMN countryside INTEGER NOT NULL DEFAULT 0`;
		}
		if (!hasCol("payments", "delivered_at")) {
			void this.agent.sql`ALTER TABLE payments ADD COLUMN delivered_at INTEGER`;
		}
		if (!hasCol("payments", "receipt_url")) {
			void this.agent.sql`ALTER TABLE payments ADD COLUMN receipt_url TEXT`;
		}
		if (!hasCol("payments", "receipt_amount")) {
			void this.agent.sql`ALTER TABLE payments ADD COLUMN receipt_amount INTEGER`;
		}
	}

	// ─── Meta & outbox ───────────────────────────────────────────────────────

	getMeta(key: string): string | undefined {
		return this.agent.sql<{ value: string }>`SELECT value FROM meta WHERE key = ${key}`[0]?.value;
	}

	setMeta(key: string, value: string): void {
		void this.agent.sql`INSERT OR REPLACE INTO meta (key, value) VALUES (${key}, ${value})`;
	}

	deleteMeta(key: string): void {
		void this.agent.sql`DELETE FROM meta WHERE key = ${key}`;
	}

	allMeta(): Array<{ key: string; value: string }> {
		return this.agent.sql<{ key: string; value: string }>`
			SELECT key, value FROM meta ORDER BY key ASC`;
	}

	outboxHas(key: string): boolean {
		return this.agent.sql<{ key: string }>`SELECT key FROM outbox WHERE key = ${key}`.length > 0;
	}

	markOutbox(key: string): void {
		void this.agent.sql`INSERT OR IGNORE INTO outbox (key, sent_at) VALUES (${key}, ${Date.now()})`;
	}

	allOutbox(): Array<{ key: string; sent_at: number }> {
		return this.agent.sql<{ key: string; sent_at: number }>`
			SELECT key, sent_at FROM outbox ORDER BY sent_at ASC`;
	}

	isPaused(): boolean {
		const pausedUntil = Number(this.getMeta("paused_until") ?? "0");
		return Number.isFinite(pausedUntil) && pausedUntil > Date.now();
	}

	within23h(now = Date.now()): boolean {
		const last = Number(this.getMeta("last_inbound_at") ?? "0");
		return Number.isFinite(last) && last > 0 && now - last < WINDOW_23H_MS;
	}

	recordConfirmSent(revision: number, now = Date.now()): void {
		this.setMeta("last_outbound", "confirm");
		this.setMeta("confirm_rev", String(revision));
		this.setMeta("confirm_at", String(now));
	}

	clearLastOutbound(): void {
		this.deleteMeta("last_outbound");
	}

	canAffirmativeConfirm(now = Date.now()): boolean {
		if (this.getMeta("last_outbound") !== "confirm") {
			return false;
		}
		const rev = Number(this.getMeta("confirm_rev") ?? "-1");
		const at = Number(this.getMeta("confirm_at") ?? "0");
		return rev === this.checkout().revision && now - at < CONFIRM_TEXT_TTL_MS;
	}

	latestSeq(): number {
		const seq = Number(this.getMeta("latest_seq") ?? "0");
		return Number.isFinite(seq) ? seq : 0;
	}

	// ─── Inbox ───────────────────────────────────────────────────────────────

	insertInbox(eventId: string, payloadJson: string, now = Date.now()): boolean {
		const exists =
			this.agent.sql<{ event_id: string }>`SELECT event_id FROM inbox WHERE event_id = ${eventId}`
				.length > 0;
		if (exists) {
			return false;
		}
		const seqRow = this.agent.sql<{ max: number }>`SELECT COALESCE(MAX(seq), 0) AS max FROM inbox`;
		const seq = (seqRow[0]?.max ?? 0) + 1;
		void this.agent.sql`
			INSERT INTO inbox (event_id, seq, payload, status, at)
			VALUES (${eventId}, ${seq}, ${payloadJson}, 'pending', ${now})`;
		this.setMeta("latest_seq", String(seq));
		this.setMeta("last_inbound_at", String(now));
		return true;
	}

	pendingInboxRows(): Array<InboxRow> {
		const staleClaim = Date.now() - CLAIM_STALE_MS;
		return this.agent.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at, attempts, turn_id FROM inbox
			WHERE status = 'pending'
				OR status = 'applied'
				OR (status = 'processing' AND claimed_at < ${staleClaim})
			ORDER BY seq ASC`;
	}

	strictPendingInboxRows(): Array<InboxRow> {
		return this.agent.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at, attempts, turn_id FROM inbox
			WHERE status = 'pending' ORDER BY seq ASC`;
	}

	hasUnfinishedInbox(): boolean {
		return (
			this.agent.sql`
				SELECT event_id FROM inbox WHERE status IN ('pending', 'processing', 'applied') LIMIT 1`
				.length > 0
		);
	}

	claimInboxRows(rows: Array<InboxRow>): Array<InboxRow> {
		const now = Date.now();
		const staleClaim = now - CLAIM_STALE_MS;
		const claimed: Array<InboxRow> = [];
		for (const row of rows) {
			const won = this.agent.sql<{ attempts: number; event_id: string }>`
				UPDATE inbox SET status = 'processing', claimed_at = ${now}, attempts = attempts + 1
				WHERE event_id = ${row.event_id}
					AND (status = 'pending'
						OR status = 'applied'
						OR (status = 'processing' AND claimed_at < ${staleClaim}))
				RETURNING event_id, attempts`;
			if (won[0] !== undefined) {
				claimed.push({ ...row, attempts: won[0].attempts });
			}
		}
		return claimed;
	}

	resetProcessingInbox(rows: Array<InboxRow>): Array<string> {
		const turnIds = new Set<string>();
		for (const row of rows) {
			const current = this.agent.sql<{ turn_id: string | null }>`
				SELECT turn_id FROM inbox WHERE event_id = ${row.event_id}`[0];
			if (current !== undefined && current.turn_id !== null) {
				turnIds.add(current.turn_id);
			}
			void this.agent
				.sql`UPDATE inbox SET status = 'pending', claimed_at = NULL WHERE event_id = ${row.event_id} AND status = 'processing'`;
		}
		return [...turnIds];
	}

	tagInboxTurn(rows: Array<InboxRow>, turnId: string): void {
		for (const row of rows) {
			void this.agent.sql`UPDATE inbox SET turn_id = ${turnId} WHERE event_id = ${row.event_id}`;
		}
	}

	markInboxApplied(eventId: string): void {
		void this.agent.sql`UPDATE inbox SET status = 'applied' WHERE event_id = ${eventId}`;
	}

	markInboxDone(eventId: string): void {
		void this.agent.sql`UPDATE inbox SET status = 'done' WHERE event_id = ${eventId}`;
	}

	markInboxFailed(eventId: string): void {
		void this.agent.sql`UPDATE inbox SET status = 'failed' WHERE event_id = ${eventId}`;
	}

	allInboxRows(): Array<InboxRow> {
		return this.agent.sql<InboxRow>`
			SELECT event_id, seq, status, at, claimed_at, attempts, turn_id, payload FROM inbox
			ORDER BY seq ASC`;
	}

	recentCustomerTexts(limit = 25): Array<string> {
		const rows = this.agent.sql<Pick<InboxRow, "payload">>`
			SELECT payload FROM inbox ORDER BY seq DESC LIMIT ${limit}`;
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

	// ─── Seen, cart & checkout ───────────────────────────────────────────────

	markSeen(ids: Array<number>): void {
		for (const id of ids) {
			void this.agent.sql`INSERT OR IGNORE INTO seen (product_id) VALUES (${id})`;
		}
	}

	isProductKnown(productId: number): boolean {
		return (
			this.agent.sql<{ product_id: number }>`
				SELECT product_id FROM seen WHERE product_id = ${productId}
				UNION SELECT product_id FROM cart WHERE product_id = ${productId}`.length > 0
		);
	}

	cartLines(): Array<CartLine> {
		const cutoff = Date.now() - CART_TTL_MS;
		void this.agent.sql`DELETE FROM cart WHERE added_at > 0 AND added_at < ${cutoff}`;
		return this.agent.sql<CartDbRow>`
			SELECT product_id, qty, name, price, added_at FROM cart ORDER BY product_id`.map(toCartLine);
	}

	replaceCart(lines: Array<CartLine>, now = Date.now()): void {
		void this.agent.sql`DELETE FROM cart`;
		for (const line of lines) {
			void this.agent.sql`
				INSERT INTO cart (product_id, qty, name, price, added_at)
				VALUES (${line.productId}, ${line.qty}, ${line.name}, ${line.price}, ${now})`;
		}
		this.bumpRevision();
	}

	upsertCartItem(line: CartLine, replaceProductIds: Array<number>, now = Date.now()): void {
		const cutoff = now - CART_TTL_MS;
		void this.agent.sql`DELETE FROM cart WHERE added_at > 0 AND added_at < ${cutoff}`;
		for (const id of replaceProductIds) {
			void this.agent.sql`DELETE FROM cart WHERE product_id = ${id}`;
		}
		void this.agent.sql`
			INSERT INTO cart (product_id, qty, name, price, added_at)
			VALUES (${line.productId}, ${line.qty}, ${line.name}, ${line.price}, ${now})
			ON CONFLICT(product_id) DO UPDATE SET
				name = excluded.name,
				price = excluded.price,
				added_at = excluded.added_at`;
		this.bumpRevision();
	}

	clearCart(): void {
		void this.agent.sql`DELETE FROM cart`;
		this.bumpRevision();
	}

	checkout(): Checkout {
		this.ensureCheckout();
		const row = this.agent.sql<CheckoutDbRow>`SELECT * FROM checkout WHERE id = 1`[0];
		if (row === undefined) {
			throw new Error("checkout row missing");
		}
		return toCheckout(row);
	}

	saveDelivery(input: DeliveryPatch): void {
		const current = this.checkout();
		const countryside = input.countryside === undefined ? current.countryside : input.countryside;
		void this.agent.sql`
			UPDATE checkout SET
				phone = ${input.phone ?? current.phone ?? null},
				address = ${input.address ?? current.address ?? null},
				note = ${input.note ?? current.note ?? null},
				countryside = ${countryside ? 1 : 0}
			WHERE id = 1`;
		this.bumpRevision();
	}

	clearDelivery(): void {
		this.ensureCheckout();
		void this.agent.sql`
			UPDATE checkout SET phone = NULL, address = NULL, note = NULL, countryside = 0
			WHERE id = 1`;
		this.bumpRevision();
	}

	private ensureCheckout(): void {
		void this.agent.sql`INSERT OR IGNORE INTO checkout (id, revision) VALUES (1, 0)`;
	}

	private bumpRevision(): void {
		this.ensureCheckout();
		void this.agent.sql`UPDATE checkout SET revision = revision + 1 WHERE id = 1`;
	}

	// ─── Payments ────────────────────────────────────────────────────────────

	upsertPayment(input: {
		accountName: string;
		accountNumber: string;
		checkoutToken: string | null;
		countryside: boolean;
		createdAt: number;
		deadline: number;
		orderNumber: string;
		paymentNumber: string;
		phone: string;
		revision: number;
		total: number;
	}): Payment {
		void this.agent.sql`
			INSERT INTO payments
				(payment_number, order_number, revision, checkout_token, account_name, account_number,
				 total, phone, created_at, status, claimed, deadline, countryside)
			VALUES (${input.paymentNumber}, ${input.orderNumber}, ${input.revision}, ${input.checkoutToken},
				${input.accountName}, ${input.accountNumber}, ${input.total}, ${input.phone}, ${input.createdAt},
				'pending', 0, ${input.deadline}, ${input.countryside ? 1 : 0})
			ON CONFLICT(payment_number) DO UPDATE SET
				order_number = excluded.order_number,
				revision = excluded.revision,
				checkout_token = excluded.checkout_token,
				account_name = excluded.account_name,
				account_number = excluded.account_number,
				total = excluded.total,
				phone = excluded.phone,
				countryside = excluded.countryside`;
		const row = this.paymentByNumber(input.paymentNumber);
		if (row === undefined) {
			throw new Error("payment_row_missing");
		}
		return row;
	}

	paymentByNumber(paymentNumber: string): Payment | undefined {
		const row = this.agent.sql<PaymentDbRow>`
			SELECT * FROM payments WHERE payment_number = ${paymentNumber}`[0];
		return row === undefined ? undefined : toPayment(row);
	}

	paymentByRevision(revision: number): Payment | undefined {
		const row = this.agent.sql<PaymentDbRow>`
			SELECT * FROM payments WHERE revision = ${revision}`[0];
		return row === undefined ? undefined : toPayment(row);
	}

	pendingPayments(now = Date.now()): Array<Payment> {
		const cutoff = now - PAYMENT_WATCH_END_MS;
		return this.agent.sql<PaymentDbRow>`
			SELECT * FROM payments
			WHERE status = 'pending' AND created_at > ${cutoff}
			ORDER BY created_at DESC`.map(toPayment);
	}

	latestPayment(): Payment | undefined {
		const row = this.agent.sql<PaymentDbRow>`
			SELECT * FROM payments ORDER BY created_at DESC LIMIT 1`[0];
		return row === undefined ? undefined : toPayment(row);
	}

	allPayments(): Array<Payment> {
		return this.agent.sql<PaymentDbRow>`
			SELECT * FROM payments ORDER BY created_at ASC`.map(toPayment);
	}

	markPaymentStatus(paymentNumber: string, status: string): void {
		void this.agent
			.sql`UPDATE payments SET status = ${status} WHERE payment_number = ${paymentNumber}`;
	}

	markPaymentClaimed(paymentNumber: string, receipt?: { amount?: number; url?: string }): void {
		void this.agent.sql`
			UPDATE payments SET
				claimed = 1,
				receipt_amount = COALESCE(${receipt?.amount ?? null}, receipt_amount),
				receipt_url = COALESCE(${receipt?.url ?? null}, receipt_url)
			WHERE payment_number = ${paymentNumber}`;
	}

	markPaymentDeliveredAt(paymentNumber: string, deliveredAt: number): void {
		void this.agent.sql`
			UPDATE payments SET delivered_at = COALESCE(delivered_at, ${deliveredAt})
			WHERE payment_number = ${paymentNumber}`;
	}

	// ─── Messages & turns ────────────────────────────────────────────────────

	hasMessages(): boolean {
		return this.agent.sql`SELECT id FROM messages LIMIT 1`.length > 0;
	}

	// Seeds pre-cutover Zernio chat history once when a DO wakes up empty on an
	// existing customer thread, so the bot sees recent context on turn 1.
	seedZernioHistory(messages: Array<ModelMessage>): void {
		if (messages.length === 0 || this.hasMessages()) {
			return;
		}
		const baseAt = Date.now() - messages.length - 10;
		for (const [i, message] of messages.entries()) {
			this.saveMessage("t_zernio_seed", i, message, baseAt + i);
		}
	}

	turnOutcome(turnId: string): TurnOutcome | undefined {
		const row = this.agent.sql<{ reply: string }>`
			SELECT reply FROM turns WHERE turn_id = ${turnId}`[0];
		return row === undefined ? undefined : this.parseTurnOutcome(row.reply);
	}

	parseTurnOutcome(reply: string): TurnOutcome {
		// SAFETY: `reply` is written only by saveTurnOutcome below, which stores JSON.stringify(TurnOutcome).
		return JSON.parse(reply) as TurnOutcome;
	}

	saveTurnOutcome(turnId: string, outcome: TurnOutcome): void {
		void this.agent.sql`
			INSERT OR IGNORE INTO turns (turn_id, reply, created_at)
			VALUES (${turnId}, ${JSON.stringify(outcome)}, ${Date.now()})`;
	}

	allTurns(): Array<{ created_at: number; outcome: TurnOutcome; turn_id: string }> {
		return this.agent.sql<{ created_at: number; reply: string; turn_id: string }>`
			SELECT turn_id, reply, created_at FROM turns ORDER BY created_at ASC`.map((row) => ({
			created_at: row.created_at,
			outcome: this.parseTurnOutcome(row.reply),
			turn_id: row.turn_id,
		}));
	}

	persistTurn(
		turnId: string,
		persistedUserMessage: ModelMessage,
		responseMessages: Array<ModelMessage>,
		superseded: boolean,
	): void {
		const created = Date.now();
		this.saveMessage(turnId, 0, persistedUserMessage, created);
		if (!superseded) {
			for (const [i, message] of responseMessages.entries()) {
				this.saveMessage(turnId, i + 1, message, created + i + 1);
			}
		}
	}

	private saveMessage(turnId: string, index: number, message: ModelMessage, at: number): void {
		void this.agent.sql`
			INSERT OR IGNORE INTO messages (id, turn_id, role, content, created_at)
			VALUES (${`${turnId}:${index}`}, ${turnId}, ${message.role}, ${JSON.stringify(message)}, ${at})`;
	}

	parseMessage(content: string): ModelMessage {
		// SAFETY: `content` is written only by saveMessage above, which JSON.stringify()s a ModelMessage.
		return JSON.parse(content) as ModelMessage;
	}

	historyByTurns(count: number): Array<ModelMessage> {
		const rows = this.agent.sql<{ content: string; turn_id: string }>`
			SELECT content, turn_id FROM messages
			WHERE turn_id IN (
				SELECT turn_id FROM messages
				GROUP BY turn_id ORDER BY MAX(created_at) DESC LIMIT ${count}
			)
			ORDER BY created_at ASC`;
		return rows.map((r) => this.parseMessage(r.content));
	}

	allMessages(): Array<{
		content: ModelMessage;
		created_at: number;
		id: string;
		role: string;
		turn_id: string;
	}> {
		return this.agent.sql<{
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
	}
}
