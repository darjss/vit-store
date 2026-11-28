import { createZernioAdapter } from "@zernio/chat-sdk-adapter";
import { Agent, getAgentByName } from "agents";
import { createChatSdkState } from "agents/chat-sdk";
import { Chat, type Message } from "chat";
import { admit, type ZernioMessageEvent } from "./admit";
import type { Conversation } from "./conversation";
import { type InboundItem, normalizeInboundItem } from "./conversation";
import type { Env } from "./env";
import { zernioBaseUrl } from "./env";
import { errorFields, log, logError } from "./log";
import {
	type ActiveHandoffRow,
	type DispatchableOrder,
	dueDigestSlot,
	fetchPendingOrders,
	fetchTodayOrders,
	formatDailySummary,
	formatMomDispatchNotice,
	seededSeqForDate,
	sendOrderToPacker,
	shouldAutoDispatchOrder,
	SUMMARY_INLINE_BUTTONS,
	ubClock,
} from "./ops";
import { sendTelegramOpsNote } from "./telegram";
import { typing } from "./zernio";

const PACKER_DELIVERY_RE = /\b(ugsun|ugchihsun|hurg|hurge)\b|өгсөн|хүргэсэн/i;

export type ResolvedThread = {
	customerName?: string;
	threadId?: string;
};

// Chat SDK Message -> plain serializable item for the Conversation DO. `raw`
// is the Zernio message object with the envelope's top-level `metadata` merged
// in by the adapter, so taps (postbackPayload) and platformMessageId survive.
const toEvent = (message: Message): InboundItem =>
	normalizeInboundItem({
		attachments: message.attachments.map((a) => ({ type: a.type, url: a.url })),
		id: message.id,
		raw: message.raw,
		text: message.text,
	});

// One shared ingress DO: admits (signature + filters) before Chat SDK, records
// every admitted event in the conversation's inbox, then hands the raw request
// to the Zernio adapter so Chat SDK burst handling runs unchanged.
export class Ingress extends Agent<Env> {
	private bot?: Chat<{ zernio: ReturnType<typeof createZernioAdapter> }>;
	private readonly dispatching = new Set<string>();

	onStart() {
		const zernio = createZernioAdapter({
			apiKey: this.env.ZERNIO_API_KEY,
			baseUrl: zernioBaseUrl(this.env),
			botName: "Америк Витамин",
			webhookSecret: this.env.ZERNIO_WEBHOOK_SECRET,
		});
		const bot = new Chat({
			adapters: { zernio },
			concurrency: {
				debounceMs: 2500,
				maxQueueSize: 30,
				onQueueFull: "drop-newest",
				strategy: "burst",
			},
			state: createChatSdkState(),
			userName: "amerik-vitamin",
		});
		bot.registerSingleton();
		// chat@4.41.0 never stamps `threadId` onto the Message before enqueueing
		// it, and the Zernio adapter leaves it as ""; the burst drain then fails
		// decoding "" back into a thread id. Stamp it on the produced message.
		const baseProcessMessage = bot.processMessage.bind(bot);
		bot.processMessage = (adapter, threadId, messageOrFactory, options) =>
			baseProcessMessage(
				adapter,
				threadId,
				async () => {
					// The adapter passes a factory that awaits parseMessage; other
					// adapters may pass a concrete Message. `raw` exists only on
					// Message, so the `in` check narrows both branches.
					const message = "raw" in messageOrFactory ? messageOrFactory : await messageOrFactory();
					return Object.assign(message, { threadId });
				},
				options,
			);
		bot.onDirectMessage(async (thread, message, _channel, ctx) => {
			const conversation = await this.conversation(thread.id);
			await conversation.process([...(ctx?.skipped ?? []), message].map(toEvent));
		});
		this.bot = bot;

		void this.sql`
			CREATE TABLE IF NOT EXISTS threads (
				thread_id TEXT PRIMARY KEY,
				last_at INTEGER NOT NULL,
				customer_name TEXT
			)`;
		const hasNameCol = this.sql<{
			name: string;
		}>`SELECT name FROM pragma_table_info('threads')`.some((c) => c.name === "customer_name");
		if (!hasNameCol) {
			void this.sql`ALTER TABLE threads ADD COLUMN customer_name TEXT`;
		}
		void this.sql`
			CREATE TABLE IF NOT EXISTS dispatched_orders (
				order_number TEXT PRIMARY KEY,
				ub_date TEXT NOT NULL,
				seq INTEGER NOT NULL,
				total INTEGER NOT NULL,
				paid INTEGER NOT NULL,
				dispatched_at INTEGER NOT NULL
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS active_handoffs (
				thread_id TEXT PRIMARY KEY,
				customer_name TEXT NOT NULL,
				reason TEXT NOT NULL,
				summary TEXT NOT NULL,
				at INTEGER NOT NULL
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS ops_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)`;
	}

	async onRequest(request: Request): Promise<Response> {
		const bot = this.bot;
		if (bot === undefined) {
			return new Response("not initialized", { status: 503 });
		}
		const raw = await request.text();
		const admission = await admit(request, this.env, raw);
		if (!admission.ok) {
			if (admission.kind === "packer") {
				this.ctx.waitUntil(this.handlePackerEvent(admission.event));
			}
			return admission.response;
		}
		const { conversationId, event, threadId } = admission;

		const conversation = await this.conversation(threadId);
		// Durable commit point: the event is in `inbox` (pending) before Chat
		// SDK sees it, so a crash mid-turn can resume instead of losing it.
		const { inserted } = await conversation.noteInbound({ eventId: event.id, payload: event });
		this.logInbound(threadId, event, inserted);
		this.ctx.waitUntil(typing(this.env, conversationId, event.account.id));
		this.touchThread(threadId, event);

		const forwarded = new Request(request.url, {
			body: raw,
			headers: request.headers,
			method: request.method,
		});
		return bot.webhooks.zernio(forwarded, {
			waitUntil: (task: Promise<unknown>) => this.ctx.waitUntil(task),
		});
	}

	private logInbound(threadId: string, event: ZernioMessageEvent, inserted: boolean): void {
		const attachments = event.message.attachments ?? [];
		const tap =
			event.metadata?.postbackPayload !== undefined ||
			event.metadata?.quickReplyPayload !== undefined;
		log({
			ad_id: event.metadata?.referral?.ad_id,
			event: "inbound",
			event_id: event.id,
			inserted,
			kind: tap ? "tap" : attachments.some((a) => a.type === "image") ? "photo" : "text",
			text_len: event.message.text?.length ?? 0,
			thread: threadId,
		});
	}

	private touchThread(threadId: string, event: ZernioMessageEvent): void {
		const customerName =
			event.conversation.participantName?.trim() || event.message.sender?.name?.trim() || null;
		const now = Date.now();
		void this.sql`
			INSERT INTO threads (thread_id, last_at, customer_name)
			VALUES (${threadId}, ${now}, ${customerName})
			ON CONFLICT (thread_id) DO UPDATE SET
				last_at = ${now},
				customer_name = COALESCE(${customerName}, threads.customer_name)`;
	}

	adminList(since = 0) {
		return this.sql<{ last_at: number; thread_id: string }>`
			SELECT thread_id, last_at FROM threads
			WHERE last_at >= ${since} ORDER BY last_at DESC LIMIT 1000`;
	}

	// ─── Mom Ops: handoff registry, Tsogzolmaa dispatch & daily summary ──────

	recordHandoff(input: {
		customerName: string;
		reason: string;
		summary: string;
		threadId: string;
	}): void {
		const name =
			input.customerName.trim() || this.threadCustomerName(input.threadId) || "Нэр тодорхойгүй";
		void this.sql`
			INSERT INTO active_handoffs (thread_id, customer_name, reason, summary, at)
			VALUES (${input.threadId}, ${name}, ${input.reason}, ${input.summary.slice(0, 120)}, ${Date.now()})
			ON CONFLICT (thread_id) DO UPDATE SET
				customer_name = excluded.customer_name,
				reason = excluded.reason,
				summary = excluded.summary,
				at = excluded.at`;
	}

	clearHandoff(threadId: string): void {
		void this.sql`DELETE FROM active_handoffs WHERE thread_id = ${threadId}`;
	}

	resolveThread(conversationId: string): ResolvedThread {
		const suffix = `:${conversationId}`;
		const handoff = this.sql<{ customer_name: string; thread_id: string }>`
			SELECT thread_id, customer_name FROM active_handoffs
			WHERE thread_id LIKE ${`%${suffix}`} LIMIT 1`[0];
		if (handoff !== undefined) {
			return { customerName: handoff.customer_name, threadId: handoff.thread_id };
		}
		const row = this.sql<{ customer_name: string | null; thread_id: string }>`
			SELECT thread_id, customer_name FROM threads
			WHERE thread_id LIKE ${`%${suffix}`} ORDER BY last_at DESC LIMIT 1`[0];
		return row === undefined
			? {}
			: { customerName: row.customer_name ?? undefined, threadId: row.thread_id };
	}

	async dispatchOrderByNumber(orderNumber: string): Promise<{ dispatched: boolean; seq?: number }> {
		if (this.isDispatched(orderNumber) || this.dispatching.has(orderNumber)) {
			return { dispatched: false };
		}
		const pending = await fetchPendingOrders(this.env);
		const order = pending.find((o) => o.orderNumber === orderNumber);
		if (order === undefined || !shouldAutoDispatchOrder(order)) {
			return { dispatched: false };
		}
		const seq = await this.dispatchOne(order);
		return seq === undefined ? { dispatched: false } : { dispatched: true, seq };
	}

	async dispatchPendingOrders(): Promise<{ dispatched: number; failed: number }> {
		const pending = await fetchPendingOrders(this.env);
		const ready = pending
			.filter((o) => shouldAutoDispatchOrder(o) && !this.isDispatched(o.orderNumber))
			.reverse();
		let dispatched = 0;
		let failed = 0;
		for (const order of ready) {
			const seq = await this.dispatchOne(order);
			if (seq !== undefined) {
				dispatched += 1;
			} else {
				failed += 1;
			}
		}
		return { dispatched, failed };
	}

	async buildDailySummary(): Promise<string> {
		const now = Date.now();
		const ubDate = ubClock(now).date;
		const [orders, pending] = await Promise.all([
			fetchTodayOrders(this.env).catch((): Array<DispatchableOrder> => []),
			fetchPendingOrders(this.env).catch((): Array<DispatchableOrder> => []),
		]);
		const dispatchedRow = this.sql<{ count: number }>`
			SELECT COUNT(*) AS count FROM dispatched_orders WHERE ub_date = ${ubDate}`[0];
		const dispatchedToday = (dispatchedRow?.count ?? 0) + seededSeqForDate(ubDate);
		const unsentPending = pending.filter(
			(o) => shouldAutoDispatchOrder(o) && !this.isDispatched(o.orderNumber),
		).length;
		const handoffs = this.sql<ActiveHandoffRow>`
			SELECT thread_id, customer_name, reason, summary, at FROM active_handoffs
			ORDER BY at ASC`;
		return formatDailySummary({
			dispatchedToday,
			handoffs,
			lastPackerUpdate: this.getOpsMeta("last_packer_update"),
			now,
			orders,
			unsentPending,
		});
	}

	async opsTick(): Promise<void> {
		try {
			await this.dispatchPendingOrders();
		} catch (error) {
			logError({ error: errorFields(error), event: "error", where: "ops_dispatch" });
		}
		const slot = dueDigestSlot();
		if (slot === undefined || this.getOpsMeta("last_digest_slot") === slot) {
			return;
		}
		const summary = await this.buildDailySummary().catch(() => undefined);
		if (summary === undefined) {
			return;
		}
		const sent = await sendTelegramOpsNote(this.env, summary, SUMMARY_INLINE_BUTTONS).catch(
			() => undefined,
		);
		if (sent?.ok) {
			this.setOpsMeta("last_digest_slot", slot);
		}
	}

	private async dispatchOne(order: DispatchableOrder): Promise<number | undefined> {
		if (this.isDispatched(order.orderNumber) || this.dispatching.has(order.orderNumber)) {
			return undefined;
		}
		this.dispatching.add(order.orderNumber);
		try {
			const now = Date.now();
			const ubDate = ubClock(now).date;
			const seq = this.nextSeqForDate(ubDate);
			const ok = await sendOrderToPacker(this.env, order, seq);
			if (!ok) {
				await this.notifyDispatchErrorOnce(order.orderNumber);
				return undefined;
			}
			void this.sql`
				INSERT OR IGNORE INTO dispatched_orders (order_number, ub_date, seq, total, paid, dispatched_at)
				VALUES (${order.orderNumber}, ${ubDate}, ${seq}, ${order.total}, ${order.paymentStatus === "success" ? 1 : 0}, ${now})`;
			await sendTelegramOpsNote(this.env, formatMomDispatchNotice(order, seq)).catch(() => {});
			return seq;
		} finally {
			this.dispatching.delete(order.orderNumber);
		}
	}

	private async notifyDispatchErrorOnce(orderNumber: string): Promise<void> {
		const key = `dispatch_err:${orderNumber}`;
		if (this.getOpsMeta(key) !== undefined) {
			return;
		}
		const res = await sendTelegramOpsNote(
			this.env,
			`⚠️ №${orderNumber} Цогзолмаа руу автоматаар илгээгдсэнгүй (24ц мессежийн цонх хаагдсан байж магадгүй). Цогзолмаагаас мессеж бичүүлээд "Илгээгүйг явуулах" товчоо дарна уу.`,
		).catch(() => undefined);
		if (res?.ok) {
			this.setOpsMeta(key, String(Date.now()));
		}
	}

	private async handlePackerEvent(event: ZernioMessageEvent): Promise<void> {
		const seenKey = `packer_ev:${event.id}`;
		if (this.getOpsMeta(seenKey) !== undefined) {
			return;
		}
		this.setOpsMeta(seenKey, String(Date.now()));
		const text = event.message.text?.trim() ?? "";
		const photoUrl = (event.message.attachments ?? []).find(
			(a) => a.type === "image" && a.url,
		)?.url;
		if (text.length === 0 && !photoUrl) {
			return;
		}
		const time = ubClock().time;
		const isDelivery = PACKER_DELIVERY_RE.test(text);
		if (isDelivery && text.length > 0) {
			this.setOpsMeta("last_packer_update", `"${text.slice(0, 80)}" (${time})`);
		}
		const lines = [
			isDelivery
				? `📦 Цогзолмаа (${time}): ${text}`
				: `💬 Цогзолмаа (${time}): ${text || "[зураг]"}`,
			...(photoUrl ? [`Зураг: ${photoUrl}`] : []),
		];
		await sendTelegramOpsNote(this.env, lines.join("\n")).catch(() => {});
	}

	private isDispatched(orderNumber: string): boolean {
		return (
			this.sql<{ order_number: string }>`
				SELECT order_number FROM dispatched_orders WHERE order_number = ${orderNumber}`.length > 0
		);
	}

	private nextSeqForDate(ubDate: string): number {
		const row = this.sql<{ max: number }>`
			SELECT COALESCE(MAX(seq), 0) AS max FROM dispatched_orders WHERE ub_date = ${ubDate}`[0];
		return Math.max(row?.max ?? 0, seededSeqForDate(ubDate)) + 1;
	}

	private threadCustomerName(threadId: string): string | undefined {
		return (
			this.sql<{ customer_name: string | null }>`
				SELECT customer_name FROM threads WHERE thread_id = ${threadId}`[0]?.customer_name ??
			undefined
		);
	}

	private getOpsMeta(key: string): string | undefined {
		return this.sql<{ value: string }>`SELECT value FROM ops_meta WHERE key = ${key}`[0]?.value;
	}

	private setOpsMeta(key: string, value: string): void {
		void this.sql`INSERT OR REPLACE INTO ops_meta (key, value) VALUES (${key}, ${value})`;
	}

	private conversation(threadId: string) {
		return getAgentByName<Env, Conversation>(this.env.Conversation, threadId);
	}
}
