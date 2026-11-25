import { generateText, hasToolCall, isStepCount, type ModelMessage, type ToolSet } from "ai";
import { Agent } from "agents";
import * as v from "valibot";

import { zernioMessageEventSchema } from "./admit";
import { isAffirmativeConfirm, listingKey, parseTransferDonePayload } from "./cart";
import { cartReplace, confirmOrder, handleTap, sendConfirmOrNeed } from "./conversation-checkout";
import {
	buildUserMessages,
	extractPaymentAction,
	inboundItemsSchema,
	inboundRawSchema,
	incomingPhones,
	lastToolCallInput,
	messageText,
	normalizeInboundItem,
	segmentClaimed,
	toSeedModelMessages,
	turnIdFor,
	type InboundItem,
} from "./conversation-helpers";
import { createConversationIO, type ConversationIO } from "./conversation-io";
import {
	claimTransfer,
	dispatchPaymentAction,
	paymentTick,
	recheckTransfer,
	type PaymentTickResult,
} from "./conversation-payments";
import { ConversationStore, type InboxRow, type TurnOutcome } from "./conversation-store";
import { HANDOFF, IMAGE_UNREADABLE } from "./copy";
import type { Env } from "./env";
import { errorFields, log, logError, turnFailedLog, turnLog } from "./log";
import { createModel, modelName, providerOptions } from "./model";
import { stateNote, systemPrompt } from "./prompt";
import { renderTurn } from "./render";
import { botClient, storeClient, withTimeout } from "./store";
import { sendTelegramAlert } from "./telegram";
import {
	createTools,
	handoffInputSchema,
	replyInputSchema,
	type AdProduct,
	type PaymentAction,
	type ReplyResult,
	type SearchHit,
	type ToolDeps,
} from "./tools";
import { adProductIds, listMessages } from "./zernio";

export { normalizeInboundItem, type InboundItem } from "./conversation-helpers";
export type { PaymentTickResult } from "./conversation-payments";

const noteInboundSchema = v.object({
	eventId: v.pipe(v.string(), v.minLength(1)),
	payload: zernioMessageEventSchema,
});

const HISTORY_TURNS = 20;
const MAX_STEPS = 5;
const MAX_ATTEMPTS = 3;
const REPROCESS_MAX_AGE_MS = 10 * 60_000;
const FALLBACK_TEXT = "Шалгаад хэлье.";
const HANDOFF_PAUSE_MS = 12 * 60 * 60_000;
const HUMAN_PAUSE_MS = 2 * 60 * 60_000;
const HUMAN_SETTLE_MS = 15_000;

type RowAction =
	| { kind: "affirmative_confirm" }
	| { kind: "claim"; paymentNumber: string }
	| { item: InboundItem; kind: "model" }
	| { kind: "none" }
	| { kind: "tap"; payload: string };

// Durable Object orchestrator for one Messenger conversation.
export class Conversation extends Agent<Env> {
	private readonly store = new ConversationStore(this);
	private ioCache?: ConversationIO;
	private processing = false;

	private io(): ConversationIO {
		this.ioCache ??= createConversationIO({
			adProducts: () => this.adProducts(),
			ensurePaymentWatch: (paymentNumber) => this.ensurePaymentWatch(paymentNumber),
			env: this.env,
			handoffToAdmin: (reason, sendKey, extraLines) =>
				this.handoffToAdmin(reason, sendKey, extraLines),
			store: this.store,
			thread: this.name ?? "",
		});
		return this.ioCache;
	}

	onStart(): void {
		this.store.migrate();
		const pending = this.store.pendingInboxRows();
		if (pending.length > 0) {
			this.ctx.waitUntil(this.processItems(pending));
		}
	}

	async noteInbound(input: {
		eventId: string;
		payload: v.InferOutput<typeof zernioMessageEventSchema>;
	}): Promise<{ inserted: boolean }> {
		const parsed = v.safeParse(noteInboundSchema, input);
		if (!parsed.success) {
			throw new Error("noteInbound: bad input");
		}
		const adId = parsed.output.payload.metadata?.referral?.ad_id;
		if (adId && this.store.getMeta("ad_id") === undefined) {
			this.store.setMeta("ad_id", adId);
		}
		const inserted = this.store.insertInbox(
			parsed.output.eventId,
			JSON.stringify(parsed.output.payload),
		);
		if (!inserted) {
			return { inserted: false };
		}
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
		const rows = parsed.output.flatMap((item) => {
			const row = this.findPendingRow(item);
			return row === undefined ? [] : [row];
		});
		await this.processItems(rows);
	}

	async paymentTick(paymentNumber: string): Promise<PaymentTickResult> {
		return paymentTick(this.io(), paymentNumber);
	}

	async recoverInbox(): Promise<void> {
		const rows = this.store.pendingInboxRows();
		if (rows.length > 0) {
			log({ event: "recover", rows: rows.length, thread: this.name ?? "" });
			await this.processItems(rows);
		}
		if (this.store.hasUnfinishedInbox()) {
			for (const s of this.getSchedules().filter((x) => x.callback === "recoverInbox")) {
				await this.cancelSchedule(s.id);
			}
			await this.schedule(this.recoverSeconds(), "recoverInbox", {});
		}
	}

	// ─── Admin RPCs ──────────────────────────────────────────────────────────

	adminSnapshot() {
		return {
			cart: this.store.cartLines(),
			checkout: this.store.checkout(),
			inbox: this.store
				.allInboxRows()
				.map(({ at, attempts, claimed_at, event_id, seq, status, turn_id }) => ({
					at,
					attempts,
					claimed_at,
					event_id,
					seq,
					status,
					turn_id,
				})),
			messages: this.store.allMessages().map((row) => ({
				role: row.role,
				text: messageText(row.content),
			})),
			paused_until: this.store.getMeta("paused_until") ?? null,
			payments: this.store.allPayments(),
		};
	}

	adminResume() {
		this.store.deleteMeta("paused_until");
		this.store.setMeta("resumed_at", String(Date.now()));
		return { resumed: true };
	}

	adminTranscript() {
		const inbox = this.store.allInboxRows().map((row) => {
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
		return {
			cart: this.store.cartLines(),
			checkout: this.store.checkout(),
			inbox,
			messages: this.store.allMessages(),
			meta: this.store.allMeta(),
			outbox: this.store.allOutbox(),
			payments: this.store.allPayments(),
			thread: this.name,
			turns: this.store.allTurns(),
		};
	}

	// ─── Inbox processing ────────────────────────────────────────────────────

	private async processItems(rows: Array<InboxRow>): Promise<void> {
		if (this.processing) {
			return;
		}
		this.processing = true;
		try {
			const claimed = this.store.claimInboxRows(rows);
			if (claimed.length === 0) {
				return;
			}
			await this.armRecovery();
			try {
				await this.runClaimed(claimed);
			} catch (error) {
				turnFailedLog({
					attempts: Math.max(...claimed.map((r) => r.attempts)),
					error: errorFields(error),
					event_ids: claimed.map((r) => r.event_id),
					thread: this.name ?? "",
					turn_ids: this.store.resetProcessingInbox(claimed),
				});
			}
		} finally {
			this.processing = false;
			const leftover = this.store.pendingInboxRows().filter((r) => r.attempts === 0);
			if (leftover.length > 0) {
				void this.processItems(leftover);
			}
		}
	}

	private async runClaimed(claimed: Array<InboxRow>): Promise<void> {
		const seqAtStart = this.store.latestSeq();
		await this.pauseIfHumanReplied();

		let items: Array<InboundItem> = [];
		let modelRows: Array<InboxRow> = [];
		let handedOff = false;
		let rechecked = false;

		const flush = async (): Promise<void> => {
			if (items.length === 0) {
				return;
			}
			const turnId = await turnIdFor(modelRows);
			this.store.tagInboxTurn(modelRows, turnId);
			await this.respond({ items, rows: modelRows, seqAtStart, turnId });
			items = [];
			modelRows = [];
		};

		for (const seg of segmentClaimed(claimed, Date.now() - REPROCESS_MAX_AGE_MS, MAX_ATTEMPTS)) {
			if (seg.kind === "dead") {
				await flush();
				this.store.markInboxFailed(seg.row.event_id);
				if (!handedOff) {
					handedOff = true;
					await this.handoffToAdmin("bot_failed", `bot_failed:${seg.row.event_id}`);
				}
				continue;
			}
			if (seg.kind === "replay") {
				await flush();
				const replayItems = seg.rows.flatMap((r) => {
					const item = this.itemFromRow(r);
					return item === undefined ? [] : [item];
				});
				await this.respond({ items: replayItems, rows: seg.rows, seqAtStart, turnId: seg.turnId });
				continue;
			}

			const action = this.classifyRow(seg.row, items.length === 0);
			if (action.kind === "model") {
				if (!rechecked) {
					rechecked = true;
					this.ctx.waitUntil(recheckTransfer(this.io()));
				}
				items.push(action.item);
				modelRows.push(seg.row);
				continue;
			}
			await flush();
			if (action.kind !== "claim" && this.store.isPaused()) {
				this.store.markInboxDone(seg.row.event_id);
				continue;
			}
			await this.runRowAction(seg.row, action);
			this.store.markInboxDone(seg.row.event_id);
		}
		await flush();
	}

	private classifyRow(row: InboxRow, queueEmpty: boolean): RowAction {
		const item = this.itemFromRow(row);
		if (item === undefined) {
			return { kind: "none" };
		}
		const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
		const metadata = raw.success ? raw.output.metadata : undefined;
		const tapPayload = metadata?.postbackPayload ?? metadata?.quickReplyPayload;
		if (tapPayload !== undefined) {
			const done = parseTransferDonePayload(tapPayload);
			if (done !== undefined) {
				return { kind: "claim", paymentNumber: done };
			}
			return this.store.isPaused() ? { kind: "none" } : { kind: "tap", payload: tapPayload };
		}
		if (this.store.isPaused()) {
			return { kind: "none" };
		}
		if (this.shouldAffirmativeConfirm(item, queueEmpty)) {
			return { kind: "affirmative_confirm" };
		}
		return { item, kind: "model" };
	}

	private shouldAffirmativeConfirm(item: InboundItem, queueEmpty: boolean): boolean {
		return (
			queueEmpty &&
			(item.attachments ?? []).length === 0 &&
			this.store.canAffirmativeConfirm() &&
			isAffirmativeConfirm(item.text)
		);
	}

	private async runRowAction(row: InboxRow, action: RowAction): Promise<void> {
		const io = this.io();
		if (action.kind === "tap") {
			await handleTap(io, row, action.payload);
		} else if (action.kind === "claim") {
			await claimTransfer(io, row.event_id, action.paymentNumber);
		} else if (action.kind === "affirmative_confirm") {
			await confirmOrder(io, row.event_id, this.store.checkout().revision, "text");
		}
	}

	// ─── Model turn ──────────────────────────────────────────────────────────

	private async respond(opts: {
		items: Array<InboundItem>;
		rows: Array<InboxRow>;
		seqAtStart: number;
		turnId: string;
	}): Promise<void> {
		const { items, rows, seqAtStart, turnId } = opts;
		const started = Date.now();
		const attempt = Math.max(...rows.map((r) => r.attempts));

		const saved = this.store.turnOutcome(turnId);
		if (saved !== undefined) {
			await this.replaySavedTurn({ attempt, inputs: items.length, rows, saved, started, turnId });
			return;
		}

		await this.prefillFromHistory();
		const { firstPhotoUrl, hadPhotos, persistedUserMessage, photoCount, text, userMessage } =
			await buildUserMessages(this.env, items);

		if (text.length === 0 && hadPhotos && photoCount === 0) {
			this.store.persistTurn(turnId, persistedUserMessage, [], false);
			await this.io().sendPart(`${turnId}:text`, { message: IMAGE_UNREADABLE });
			this.finishTurn(rows);
			this.logTurn({
				attempt,
				inputs: items.length,
				outcome: "image_unreadable",
				reply_text: IMAGE_UNREADABLE,
				started,
				turnId,
			});
			return;
		}

		const adProducts = await this.adProducts();
		const { result, stepMs } = await this.runModel(
			[...this.store.historyByTurns(HISTORY_TURNS), this.stateMessage(adProducts), userMessage],
			adProducts,
		);
		await this.completeModelTurn({
			attempt,
			firstPhotoUrl,
			inputs: items.length,
			persistedUserMessage,
			photoCount,
			result,
			rows,
			seqAtStart,
			started,
			stepMs,
			turnId,
		});
	}

	private async replaySavedTurn(opts: {
		attempt: number;
		inputs: number;
		rows: Array<InboxRow>;
		saved: TurnOutcome;
		started: number;
		turnId: string;
	}): Promise<void> {
		const { attempt, inputs, rows, saved, started, turnId } = opts;
		const outcome = await this.dispatchTurn({
			handoffMessage: saved.handoffMessage,
			handoffReason: saved.handoff,
			paymentAction: saved.payment,
			reply: saved.reply,
			superseded: saved.superseded ?? false,
			turnId,
		});
		this.finishTurn(rows);
		this.logTurn({
			action: saved.reply?.action,
			attempt,
			handoff: saved.handoff !== undefined,
			inputs,
			outcome,
			payment_action: saved.payment?.kind,
			product_ids: saved.reply?.productIds ?? [],
			replayed: true,
			reply_text: saved.reply?.text,
			started,
			turnId,
		});
	}

	private async completeModelTurn(opts: {
		attempt: number;
		firstPhotoUrl: string | undefined;
		inputs: number;
		persistedUserMessage: ModelMessage;
		photoCount: number;
		result: Awaited<ReturnType<Conversation["runModel"]>>["result"];
		rows: Array<InboxRow>;
		seqAtStart: number;
		started: number;
		stepMs: Array<number>;
		turnId: string;
	}): Promise<void> {
		const {
			attempt,
			firstPhotoUrl,
			inputs,
			persistedUserMessage,
			photoCount,
			result,
			rows,
			seqAtStart,
			started,
			stepMs,
			turnId,
		} = opts;
		const reply = lastToolCallInput(result.steps, "reply", replyInputSchema);
		const handoff = lastToolCallInput(result.steps, "handoff", handoffInputSchema);
		const paymentAction = extractPaymentAction(result.steps);
		const superseded = this.store.latestSeq() > seqAtStart;

		this.store.saveTurnOutcome(turnId, {
			handoff: handoff?.reason,
			handoffMessage: handoff?.message,
			payment: paymentAction,
			reply,
			superseded,
		});
		// ai@7: responseMessages is cumulative across all steps (response.messages is last step only).
		this.store.persistTurn(turnId, persistedUserMessage, result.responseMessages, superseded);

		const outcome = await this.dispatchTurn({
			handoffMessage: handoff?.message,
			handoffReason: handoff?.reason,
			paymentAction,
			receiptUrl: firstPhotoUrl,
			reply,
			superseded,
			turnId,
		});
		this.finishTurn(rows);

		this.logTurn({
			action: reply?.action,
			attempt,
			handoff: handoff !== undefined,
			inputs,
			outcome,
			payment_action: paymentAction?.kind,
			photos: photoCount,
			product_ids: reply?.productIds ?? [],
			reply_text: reply?.text,
			started,
			step_ms: stepMs,
			steps: result.steps.length,
			tokens_cached: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
			tokens_in: result.usage.inputTokens ?? 0,
			tokens_out: result.usage.outputTokens ?? 0,
			tool_calls: result.steps.flatMap((s) =>
				s.toolCalls.map((c) => ({ input: c.input, name: c.toolName })),
			),
			tools: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
			turnId,
		});
	}

	private async runModel(messages: Array<ModelMessage>, adProducts: Array<AdProduct>) {
		const io = this.io();
		const toolDeps: ToolDeps = {
			cartLines: () => this.store.cartLines(),
			cartReplace: (nextItems) => cartReplace(io, nextItems),
			checkout: () => this.store.checkout(),
			latestPayment: () => this.store.latestPayment(),
			markSeen: (ids) => this.store.markSeen(ids),
			onSearch: (hits) => this.detectAdPivot(adProducts, hits),
			pendingPayments: () => this.store.pendingPayments(),
			recentCustomerTexts: () => this.store.recentCustomerTexts(25),
			saveDelivery: (patch) => this.store.saveDelivery(patch),
		};
		const tools = createTools(this.env, toolDeps, adProducts) satisfies ToolSet;
		const stepMs: Array<number> = [];
		let lastStepAt = Date.now();
		const result = await generateText({
			instructions: systemPrompt(adProducts.length > 0),
			messages,
			model: createModel(this.env),
			onStepFinish: () => {
				const now = Date.now();
				stepMs.push(now - lastStepAt);
				lastStepAt = now;
			},
			prepareStep: ({ stepNumber }) =>
				stepNumber === MAX_STEPS - 1
					? { activeTools: ["reply", "handoff", "payment"], toolChoice: "required" as const }
					: undefined,
			providerOptions,
			stopWhen: [
				hasToolCall("reply"),
				hasToolCall("handoff"),
				({ steps }) => extractPaymentAction(steps) !== undefined,
				isStepCount(MAX_STEPS),
			],
			toolChoice: "required",
			tools,
		});
		return { result, stepMs };
	}

	private logTurn(opts: {
		action?: string;
		attempt: number;
		handoff?: boolean;
		inputs: number;
		outcome: string;
		payment_action?: string;
		photos?: number;
		product_ids?: Array<number>;
		replayed?: boolean;
		reply_text?: string;
		started: number;
		step_ms?: Array<number>;
		steps?: number;
		tokens_cached?: number;
		tokens_in?: number;
		tokens_out?: number;
		tool_calls?: Array<{ input: unknown; name: string }>;
		tools?: Array<string>;
		turnId: string;
	}): void {
		turnLog({
			action: opts.action,
			ad_id: this.store.getMeta("ad_id"),
			attempt: opts.attempt,
			conversation: this.io().conversationId,
			handoff: opts.handoff ?? false,
			inputs: opts.inputs,
			model: modelName(this.env),
			outcome: opts.outcome,
			payment_action: opts.payment_action,
			photos: opts.photos ?? 0,
			product_ids: opts.product_ids ?? [],
			replayed: opts.replayed,
			reply_text: opts.reply_text,
			step_ms: opts.step_ms ?? [],
			steps: opts.steps ?? 0,
			thread: this.name ?? "",
			tokens_cached: opts.tokens_cached ?? 0,
			tokens_in: opts.tokens_in ?? 0,
			tokens_out: opts.tokens_out ?? 0,
			tool_calls: opts.tool_calls ?? [],
			tools: opts.tools ?? [],
			total_ms: Date.now() - opts.started,
			turn_id: opts.turnId,
		});
	}

	private async dispatchTurn(opts: {
		handoffMessage?: string;
		handoffReason: string | undefined;
		paymentAction: PaymentAction | undefined;
		receiptUrl?: string;
		reply: ReplyResult | undefined;
		superseded: boolean;
		turnId: string;
	}): Promise<string> {
		const { handoffMessage, handoffReason, paymentAction, receiptUrl, reply, superseded, turnId } =
			opts;
		const io = this.io();
		if (superseded) {
			return "superseded";
		}
		if (this.store.isPaused()) {
			return "paused_drop";
		}
		if (handoffReason !== undefined) {
			if (handoffMessage && handoffMessage.trim().length > 0) {
				await io.sendPart(`${turnId}:handoff_msg`, { message: handoffMessage.trim() });
			}
			await this.handoffToAdmin(handoffReason, `${turnId}:handoff`);
			return "handoff";
		}
		if (paymentAction !== undefined) {
			this.store.clearLastOutbound();
			return dispatchPaymentAction(io, turnId, paymentAction, receiptUrl);
		}
		const shown = await renderTurn({
			accountId: io.accountId,
			conversationId: io.conversationId,
			env: this.env,
			hasSent: (key) => this.store.outboxHas(key),
			markSent: (key) => this.store.markOutbox(key),
			reply: reply ?? { text: FALLBACK_TEXT },
			turnId,
		});
		if (shown.length > 0) {
			this.store.markSeen(shown);
		}
		if (reply?.action === "confirm") {
			await sendConfirmOrNeed(io, `${turnId}:confirm`);
		} else {
			this.store.clearLastOutbound();
		}
		return reply === undefined ? "no_reply" : "sent";
	}

	// ─── Shared helpers ──────────────────────────────────────────────────────

	private async handoffToAdmin(
		reason: string,
		sendKey: string,
		extraLines?: Array<string>,
	): Promise<void> {
		this.store.clearLastOutbound();
		await this.io().sendPart(sendKey, { message: HANDOFF });
		const alertKey = `${sendKey}:alert`;
		let alert: "already_sent" | "failed" | "not_configured" | "sent";
		let alertStatus: number | undefined;
		if (this.store.outboxHas(alertKey)) {
			alert = "already_sent";
		} else {
			const result = await sendTelegramAlert(this.env, {
				extraLines,
				reason,
				recentTexts: this.store.recentCustomerTexts(10),
				threadId: this.name ?? "",
			}).catch(() => undefined);
			if (result === undefined) {
				alert = "failed";
			} else if (!result.ok) {
				alert = result.status === undefined ? "not_configured" : "failed";
				alertStatus = result.status;
			} else {
				this.store.markOutbox(alertKey);
				alert = "sent";
			}
		}
		this.store.setMeta("paused_until", String(Date.now() + HANDOFF_PAUSE_MS));
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

	// Pause for 2h when a human admin replies live after cutover. Human replies
	// sent before CUTOVER_AT do not freeze active threads when the bot takes over.
	private async pauseIfHumanReplied(): Promise<void> {
		if (this.store.isPaused()) {
			return;
		}
		const now = Date.now();
		const io = this.io();
		try {
			const messages = await listMessages(
				this.env,
				io.conversationId,
				io.accountId,
				20,
				AbortSignal.timeout(3000),
			);
			const resumedAt = Number(this.store.getMeta("resumed_at") ?? "0");
			const cutoverAt = this.env.CUTOVER_AT ? Date.parse(this.env.CUTOVER_AT) : 0;
			const floorAt = Math.max(resumedAt, Number.isFinite(cutoverAt) ? cutoverAt : 0);
			const humanMsg = messages.find((m) => {
				if (m.direction !== "outgoing") {
					return false;
				}
				const at = Date.parse(m.createdAt ?? "");
				if (!Number.isFinite(at) || at <= floorAt) {
					return false;
				}
				return m.sentVia === "human" || (m.sentVia === null && now - at > HUMAN_SETTLE_MS);
			});
			const humanAt = humanMsg ? Date.parse(humanMsg.createdAt ?? "") : undefined;
			if (humanAt === undefined || humanAt + HUMAN_PAUSE_MS <= now) {
				return;
			}
			this.store.setMeta("paused_until", String(humanAt + HUMAN_PAUSE_MS));
			log({
				event: "human_pause",
				human_at: new Date(humanAt).toISOString(),
				thread: this.name ?? "",
			});
		} catch (error) {
			logError({
				error: errorFields(error),
				event: "error",
				thread: this.name ?? "",
				where: "human_pause",
			});
		}
	}

	// Once per conversation, pull recent Zernio history to:
	// 1) seed up to 20 recent messages into empty DO history (no post-cutover amnesia)
	// 2) prefill saved customer phone + address from the Store API.
	private async prefillFromHistory(): Promise<void> {
		if (this.store.getMeta("history_checked") !== undefined) {
			return;
		}
		this.store.setMeta("history_checked", "1");
		const io = this.io();
		try {
			const budget = AbortSignal.timeout(4000);
			const messages = await listMessages(this.env, io.conversationId, io.accountId, 100, budget);
			if (!this.store.hasMessages() && messages.length > 0) {
				this.store.seedZernioHistory(toSeedModelMessages(messages));
			}
			const client = botClient(this.env);
			if (this.store.checkout().phone !== undefined || client === undefined) {
				log({ event: "history_prefill", outcome: "seeded_only", thread: this.name ?? "" });
				return;
			}
			for (const phone of incomingPhones(messages)) {
				try {
					const customer = await client.customer.getCustomerByPhone.query(
						{ phone: Number(phone) },
						{ signal: budget },
					);
					if (customer.address) {
						this.store.saveDelivery({ address: customer.address, phone });
						log({ event: "history_prefill", outcome: "found", thread: this.name ?? "" });
						return;
					}
				} catch {
					// Try next candidate.
				}
			}
			log({ event: "history_prefill", outcome: "none", thread: this.name ?? "" });
		} catch {
			log({ event: "history_prefill", outcome: "error", thread: this.name ?? "" });
		}
	}

	private async adProducts(): Promise<Array<AdProduct>> {
		if (this.store.getMeta("ad_pivoted") === "1") {
			return [];
		}
		const adId = this.store.getMeta("ad_id");
		if (adId === undefined) {
			return [];
		}
		try {
			let cached = this.store.getMeta("ad_product_ids");
			if (cached === undefined) {
				cached = (await adProductIds(this.env, adId)).join(",");
				this.store.setMeta("ad_product_ids", cached);
			}
			const ids = cached
				.split(",")
				.filter((id) => id.length > 0)
				.map(Number);
			if (ids.length === 0) {
				return [];
			}
			const products = await storeClient(this.env).product.getProductsByIdsForAssistant.query(
				{ ids },
				{ signal: withTimeout() },
			);
			const inStock = products.filter((p) => p.stockStatus !== "out_of_stock");
			if (inStock.length > 0) {
				this.store.markSeen(inStock.map((p) => p.id));
			}
			return inStock;
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

	private detectAdPivot(adProducts: Array<AdProduct>, hits: Array<SearchHit>): void {
		if (adProducts.length === 0 || hits.length === 0) {
			return;
		}
		const adKeys = new Set(adProducts.map((p) => listingKey(p.name)));
		if (!hits.some((h) => adKeys.has(listingKey(h.name)))) {
			this.store.setMeta("ad_pivoted", "1");
		}
	}

	private stateMessage(adProducts: Array<AdProduct>): ModelMessage {
		const checkout = this.store.checkout();
		const payment = this.store.latestPayment();
		return {
			content: stateNote({
				address: checkout.address,
				adProducts,
				cartLines: this.store.cartLines().map((l) => ({ name: l.name, qty: l.qty })),
				countryside: checkout.countryside,
				note: checkout.note,
				orderNumber: payment?.orderNumber,
				paymentStatus: payment?.status,
				phone: checkout.phone,
			}),
			role: "user",
		};
	}

	private findPendingRow(item: InboundItem): InboxRow | undefined {
		const raw = v.safeParse(inboundRawSchema, item.raw ?? {});
		const zernioId = raw.success ? raw.output.id : undefined;
		for (const row of this.store.strictPendingInboxRows()) {
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

	private finishTurn(rows: Array<InboxRow>): void {
		for (const row of rows) {
			this.store.markInboxDone(row.event_id);
		}
	}

	private async armRecovery(): Promise<void> {
		if (this.getSchedules().some((s) => s.callback === "recoverInbox")) {
			return;
		}
		await this.schedule(this.recoverSeconds(), "recoverInbox", {});
	}

	private recoverSeconds(): number {
		const raw = Number(this.env.INBOX_RECOVER_SECONDS ?? "120");
		return Number.isFinite(raw) && raw > 0 ? raw : 120;
	}
}
