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
import type { Env } from "./env";
import { turnLog } from "./log";
import { createModel, modelName, providerOptions } from "./model";
import { fetchImageParts } from "./photos";
import { stateNote, SYSTEM_PROMPT } from "./prompt";
import { renderTurn } from "./render";
import { createTools, replyOutputSchema } from "./tools";
import { zernioMessageEventSchema } from "./admit";

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
			}),
		),
	),
	platformMessageId: v.optional(v.string()),
});

const noteInboundSchema = v.object({
	eventId: v.pipe(v.string(), v.minLength(1)),
	payload: zernioMessageEventSchema,
});

const HISTORY_TURNS = 20;
// Pending rows older than this are dead replays: Zernio's own retry window is
// 3 minutes, so past 10 the event is never coming back through admission.
const REPROCESS_MAX_AGE_MS = 10 * 60_000;
// A 'processing' row older than this had its worker die mid-turn; safe to
// reclaim. Outbound sends still can't double-post — outbox keys gate them.
const CLAIM_STALE_MS = 90_000;
const FALLBACK_TEXT = "Шалгаад хэлье.";

type InboxRow = {
	at: number;
	claimed_at: number | null;
	event_id: string;
	payload: string;
	seq: number;
	status: string;
};

// Every sendable turn goes through this DO, one at a time. Durability shape
// from the plan: `inbox` records admitted events before Chat SDK sees them,
// `outbox` records send parts only after success, `messages` keeps whole model
// turns so history replays with tool calls and results paired.
export class Conversation extends Agent<Env> {
	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS inbox (
				event_id TEXT PRIMARY KEY,
				seq INTEGER NOT NULL,
				payload TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				at INTEGER NOT NULL,
				claimed_at INTEGER
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
		void this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`;

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

	private pendingRows(): Array<InboxRow> {
		const now = Date.now();
		const cutoff = now - REPROCESS_MAX_AGE_MS;
		const staleClaim = now - CLAIM_STALE_MS;
		return this.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at FROM inbox
			WHERE at > ${cutoff}
				AND (status = 'pending' OR (status = 'processing' AND claimed_at < ${staleClaim}))
			ORDER BY seq ASC`;
	}

	// Flip rows to 'processing' before any await: DO sql calls are synchronous,
	// so this whole loop is atomic against a concurrent process() or an onStart
	// recovery in the same instance. Only rows we actually claimed come back.
	private claimRows(rows: Array<InboxRow>): Array<InboxRow> {
		const now = Date.now();
		const staleClaim = now - CLAIM_STALE_MS;
		const claimed: Array<InboxRow> = [];
		for (const row of rows) {
			const won = this.sql<{ event_id: string }>`
				UPDATE inbox SET status = 'processing', claimed_at = ${now}
				WHERE event_id = ${row.event_id}
					AND (status = 'pending' OR (status = 'processing' AND claimed_at < ${staleClaim}))
				RETURNING event_id`;
			if (won.length > 0) {
				claimed.push(row);
			}
		}
		return claimed;
	}

	// The adapter keeps `platformMessageId` as the chat message id and the
	// Zernio internal id on `raw.id`; inbox rows key on the event id. Match on
	// the zernio message id inside the stored envelope.
	private findPendingRow(item: InboundItem): InboxRow | undefined {
		const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
		const zernioId = raw.success ? raw.output.id : undefined;
		const rows = this.sql<InboxRow>`
			SELECT event_id, seq, payload, status, at, claimed_at FROM inbox
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

	private async processItems(rows: Array<InboxRow>): Promise<void> {
		const claimed = this.claimRows(rows);
		if (claimed.length === 0) {
			return;
		}
		rows = claimed;
		// Paused conversations mark events done without a model turn (PR 4 adds
		// resume); customer silence beats a late bot reply.
		const pausedUntil = Number(this.getMeta("paused_until") ?? "0");
		if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) {
			for (const row of rows) {
				this.markDone(row.event_id);
			}
			return;
		}

		const seqAtStart = this.latestSeq();
		const items: Array<InboundItem> = [];
		for (const row of rows) {
			const item = this.itemFromRow(row);
			if (item === undefined) {
				this.markDone(row.event_id);
				continue;
			}
			const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
			const metadata = raw.success ? raw.output.metadata : undefined;
			if (metadata?.postbackPayload !== undefined || metadata?.quickReplyPayload !== undefined) {
				// Button taps are cheap and land in PR 4; never drop the inbox row
				// silently, but never wake the model for one either.
				console.log(JSON.stringify({ event: "tap_ignored_spike", event_id: row.event_id }));
				this.markDone(row.event_id);
				continue;
			}
			items.push(item);
		}
		if (items.length === 0) {
			return;
		}

		const turnId = await this.turnIdFor(rows);
		await this.respond({ items, rows, seqAtStart, turnId });
	}

	private async respond(opts: {
		items: Array<InboundItem>;
		rows: Array<InboxRow>;
		seqAtStart: number;
		turnId: string;
	}): Promise<void> {
		const { items, rows, seqAtStart, turnId } = opts;
		const started = Date.now();

		// Build the user message: text lines from every merged item plus fetched
		// image parts. Photos ride along inside the same turn.
		const text = items
			.map((i) => i.text)
			.filter((t) => t.length > 0)
			.join("\n");
		const imageParts = (
			await Promise.all(items.map((i) => fetchImageParts(i.attachments ?? [])))
		).flat();
		const userParts: Array<ImagePart | TextPart> = [
			...(text.length > 0 ? [{ text, type: "text" as const }] : []),
			...imageParts,
		];
		const userMessage: ModelMessage = { content: userParts, role: "user" };
		// History must not carry image bytes: swap image parts for a short
		// placeholder before persisting. The model sees the real bytes.
		const persistedUserMessage: ModelMessage = {
			content: userParts.map((part) =>
				part.type === "image" ? { text: "[зураг]", type: "text" as const } : part,
			),
			role: "user",
		};

		const history = this.historyByTurns(HISTORY_TURNS);
		const messages: Array<ModelMessage> = [
			...history,
			{ content: stateNote(), role: "user" },
			userMessage,
		];

		const env = this.env;
		const tools = createTools(env) satisfies ToolSet;
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
			providerOptions,
			stopWhen: [hasToolCall("reply"), stepCountIs(5)],
			system: SYSTEM_PROMPT,
			toolChoice: "required",
			tools,
		});

		const reply = this.extractReply(result);
		const superseded = this.latestSeq() > seqAtStart;

		// Whole turns only: user + assistant/tool messages saved under one
		// turn_id so history replay never splits a call from its result. A
		// superseded turn keeps only the user message — saving its assistant
		// side would make the next turn think it already answered.
		const created = Date.now();
		this.saveTurn(turnId, persistedUserMessage, created);
		if (!superseded) {
			for (const [i, message] of result.response.messages.entries()) {
				this.saveTurn(turnId, message, created + i + 1);
			}
		}
		const outcome = superseded ? "superseded" : reply === undefined ? "no_reply" : "sent";

		if (!superseded) {
			await this.sendReply({ env, reply, turnId });
		}

		for (const row of rows) {
			this.markDone(row.event_id);
		}

		turnLog({
			conversation: this.conversationId(),
			inputs: items.length,
			model: modelName(env),
			outcome,
			photos: imageParts.length,
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

	private async sendReply(opts: {
		env: Env;
		reply: ReturnType<Conversation["extractReply"]>;
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
	}) {
		for (const step of [...result.steps].reverse()) {
			for (const call of [...step.toolCalls].reverse()) {
				if (call.toolName === "reply") {
					const parsed = v.safeParse(replyOutputSchema, call.input);
					if (parsed.success) {
						return parsed.output;
					}
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

	private saveTurn(turnId: string, message: ModelMessage, at: number): void {
		const id = crypto.randomUUID();
		void this.sql`
			INSERT OR IGNORE INTO messages (id, turn_id, role, content, created_at)
			VALUES (${id}, ${turnId}, ${message.role}, ${JSON.stringify(message)}, ${at})`;
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
