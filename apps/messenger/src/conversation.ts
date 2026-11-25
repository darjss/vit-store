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
import { isAffirmativeConfirm, listingKey, parseTransferDonePayload, phonesInText } from "./cart";
import { CheckoutCoordinator } from "./conversation-checkout";
import { PaymentCoordinator, type PaymentTickResult } from "./conversation-payments";
import { ConversationStore, type InboxRow, type TurnOutcome } from "./conversation-store";
import { HANDOFF, IMAGE_UNREADABLE } from "./copy";
import type { Env } from "./env";
import { errorFields, log, logError, turnFailedLog, turnLog } from "./log";
import { createModel, modelName, providerOptions } from "./model";
import { fetchImageParts } from "./photos";
import { stateNote, systemPrompt } from "./prompt";
import { renderTurn } from "./render";
import { botClient, storeClient, withTimeout } from "./store";
import { sendTelegramAlert } from "./telegram";
import {
	createTools,
	handoffInputSchema,
	replyInputSchema,
	type AdProduct,
	type HandoffResult,
	type PaymentAction,
	type ReplyResult,
	type SearchHit,
	type ToolDeps,
} from "./tools";
import { adProductIds, listMessages, send, type ZernioSendBody } from "./zernio";

export type { PaymentTickResult } from "./conversation-payments";

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

// Messenger stickers (including thumbs-up "like") arrive as image attachments
// on /t39.1997-6/; real photos live on /t1.15752-9/. Replace stickers with
// "[стикер]" so they never fetch as photos and can confirm via text matcher.
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

const paymentResultSchema = v.object({
	action: v.optional(
		v.variant("kind", [
			v.object({ kind: v.literal("already_paid") }),
			v.object({ kind: v.literal("ambiguous") }),
			v.object({
				kind: v.literal("claim"),
				paymentNumber: v.string(),
				receiptAmount: v.optional(v.number()),
			}),
			v.object({ kind: v.literal("details"), paymentNumber: v.string() }),
		]),
	),
	handled: v.boolean(),
});

const HISTORY_TURNS = 20;
const MAX_STEPS = 5;
const MAX_ATTEMPTS = 3;
const REPROCESS_MAX_AGE_MS = 10 * 60_000;
const FALLBACK_TEXT = "Шалгаад хэлье.";
const PAUSE_MS = 12 * 60 * 60_000;
const HUMAN_SETTLE_MS = 15_000;

type RowAction =
	| { kind: "affirmative_confirm" }
	| { kind: "claim"; paymentNumber: string }
	| { item: InboundItem; kind: "model" }
	| { kind: "none" }
	| { kind: "tap"; payload: string };

const prefillLog = (outcome: string, thread: string): void =>
	log({ event: "history_prefill", outcome, thread });

// Thin Durable Object orchestrator for one Messenger conversation. Persistence
// lives in ConversationStore, checkout/taps in CheckoutCoordinator, and payment
// watch/reminders/claims in PaymentCoordinator.
export class Conversation extends Agent<Env> {
	private readonly store = new ConversationStore(this);
	private readonly payments = new PaymentCoordinator({
		ensurePaymentWatch: (paymentNumber) => this.ensurePaymentWatch(paymentNumber),
		env: this.env,
		handoffToAdmin: (reason, sendKey, extraLines) =>
			this.handoffToAdmin(reason, sendKey, extraLines),
		sendPart: (key, body) => this.sendPart(key, body),
		store: this.store,
		thread: () => this.name ?? "",
	});
	private readonly checkoutFlow = new CheckoutCoordinator({
		accountId: () => this.accountId(),
		adProducts: () => this.adProducts(),
		conversationId: () => this.conversationId(),
		ensurePaymentWatch: (paymentNumber) => this.ensurePaymentWatch(paymentNumber),
		env: this.env,
		markAdPivoted: () => this.store.setMeta("ad_pivoted", "1"),
		sendPart: (key, body) => this.sendPart(key, body),
		store: this.store,
		thread: () => this.name ?? "",
	});

	private processing = false;

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
		const rows: Array<InboxRow> = [];
		for (const item of parsed.output) {
			const row = this.findPendingRow(item);
			if (row !== undefined) {
				rows.push(row);
			}
		}
		await this.processItems(rows);
	}

	async paymentTick(paymentNumber: string): Promise<PaymentTickResult> {
		return this.payments.paymentTick(paymentNumber);
	}

	async recoverInbox(): Promise<void> {
		const rows = this.store.pendingInboxRows();
		if (rows.length > 0) {
			log({ event: "recover", rows: rows.length, thread: this.name ?? "" });
			await this.processItems(rows);
		}
		if (this.store.hasUnfinishedInbox()) {
			const pending = this.getSchedules().filter((s) => s.callback === "recoverInbox");
			for (const s of pending) {
				await this.cancelSchedule(s.id);
			}
			await this.schedule(this.recoverSeconds(), "recoverInbox", {});
		}
	}

	// ─── Admin RPCs ──────────────────────────────────────────────────────────

	adminSnapshot() {
		const messages = this.store.allMessages().map((row) => ({
			role: row.role,
			text: this.messageText(row.content),
		}));
		const inbox = this.store
			.allInboxRows()
			.map(({ at, attempts, claimed_at, event_id, seq, status, turn_id }) => ({
				at,
				attempts,
				claimed_at,
				event_id,
				seq,
				status,
				turn_id,
			}));
		return {
			cart: this.store.cartLines(),
			checkout: this.store.checkout(),
			inbox,
			messages,
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
				const turnIds = this.store.resetProcessingInbox(claimed);
				turnFailedLog({
					attempts: Math.max(...claimed.map((r) => r.attempts)),
					error: errorFields(error),
					event_ids: claimed.map((r) => r.event_id),
					thread: this.name ?? "",
					turn_ids: turnIds,
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
		const cutoff = Date.now() - REPROCESS_MAX_AGE_MS;
		const seqAtStart = this.store.latestSeq();
		await this.pauseIfHumanReplied();

		let items: Array<InboundItem> = [];
		let modelRows: Array<InboxRow> = [];
		const flush = async (): Promise<void> => {
			if (items.length === 0) {
				return;
			}
			const turnId = await this.turnIdFor(modelRows);
			this.store.tagInboxTurn(modelRows, turnId);
			await this.respond({ items, rows: modelRows, seqAtStart, turnId });
			items = [];
			modelRows = [];
		};

		let handedOff = false;
		let rechecked = false;
		for (let i = 0; i < claimed.length; i++) {
			const row = claimed[i];
			if (row === undefined) {
				continue;
			}
			if (row.attempts >= MAX_ATTEMPTS || row.at < cutoff) {
				await flush();
				this.store.markInboxFailed(row.event_id);
				if (!handedOff) {
					handedOff = true;
					await this.handoffToAdmin("bot_failed", `bot_failed:${row.event_id}`);
				}
				continue;
			}
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

			const action = this.classifyRow(row, this.store.isPaused(), items.length === 0);
			if (action.kind === "model") {
				if (!rechecked) {
					rechecked = true;
					this.ctx.waitUntil(this.payments.recheckTransfer());
				}
				items.push(action.item);
				modelRows.push(row);
				continue;
			}
			await flush();
			if (action.kind !== "claim" && this.store.isPaused()) {
				this.store.markInboxDone(row.event_id);
				continue;
			}
			await this.runRowAction(row, action);
			this.store.markInboxDone(row.event_id);
		}
		await flush();
	}

	private classifyRow(row: InboxRow, paused: boolean, queueEmpty: boolean): RowAction {
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
			return paused ? { kind: "none" } : { kind: "tap", payload: tapPayload };
		}
		if (paused) {
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
		if (action.kind === "tap") {
			await this.checkoutFlow.handleTap(row, action.payload);
		} else if (action.kind === "claim") {
			await this.payments.claimTransfer(row.event_id, action.paymentNumber);
		} else if (action.kind === "affirmative_confirm") {
			const rev = this.store.checkoutRow().revision;
			await this.checkoutFlow.confirmOrder(row.event_id, rev, "text");
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
		const thread = this.name ?? "";
		const attempt = Math.max(...rows.map((r) => r.attempts));

		const saved = this.store.turnOutcome(turnId);
		if (saved !== undefined) {
			await this.replayTurn({ attempt, items, rows, saved, started, thread, turnId });
			return;
		}

		await this.prefillDeliveryFromHistory();
		const { firstPhotoUrl, hadPhotos, persistedUserMessage, photoCount, text, userMessage } =
			await this.buildUserMessages(items);

		if (text.length === 0 && hadPhotos && photoCount === 0) {
			await this.handleUnreadablePhotos({
				attempt,
				inputs: items.length,
				persistedUserMessage,
				rows,
				started,
				thread,
				turnId,
			});
			return;
		}

		const adProducts = await this.adProducts();
		const { result, stepMs } = await this.runModel(
			[...this.store.historyByTurns(HISTORY_TURNS), this.stateMessage(adProducts), userMessage],
			adProducts,
		);

		const reply = this.extractReply(result.steps);
		const handoff = this.extractHandoff(result.steps);
		const paymentAction = this.extractPaymentAction(result.steps);
		const superseded = this.store.latestSeq() > seqAtStart;

		this.store.saveTurnOutcome(turnId, {
			handoff: handoff?.reason,
			handoffMessage: handoff?.message,
			payment: paymentAction,
			reply,
			superseded,
		});
		this.store.persistTurn(turnId, persistedUserMessage, result.response.messages, superseded);

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

		this.logModelTurn({
			attempt,
			handoff: handoff !== undefined,
			inputs: items.length,
			outcome,
			paymentAction,
			photoCount,
			reply,
			result,
			started,
			stepMs,
			thread,
			turnId,
		});
	}

	private async runModel(messages: Array<ModelMessage>, adProducts: Array<AdProduct>) {
		const toolDeps: ToolDeps = {
			cartLines: () => this.store.cartLines(),
			cartReplace: (nextItems) => this.checkoutFlow.cartReplace(nextItems),
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
				({ steps }) => this.extractPaymentAction(steps) !== undefined,
				stepCountIs(MAX_STEPS),
			],
			system: systemPrompt(adProducts.length > 0),
			toolChoice: "required",
			tools,
		});
		return { result, stepMs };
	}

	private logModelTurn(opts: {
		attempt: number;
		handoff: boolean;
		inputs: number;
		outcome: string;
		paymentAction: PaymentAction | undefined;
		photoCount: number;
		reply: ReplyResult | undefined;
		result: Awaited<ReturnType<Conversation["runModel"]>>["result"];
		started: number;
		stepMs: Array<number>;
		thread: string;
		turnId: string;
	}): void {
		const {
			attempt,
			handoff,
			inputs,
			outcome,
			paymentAction,
			photoCount,
			reply,
			result,
			started,
			stepMs,
			thread,
			turnId,
		} = opts;
		turnLog({
			action: reply?.action,
			ad_id: this.store.getMeta("ad_id"),
			attempt,
			conversation: this.conversationId(),
			handoff,
			inputs,
			model: modelName(this.env),
			outcome,
			payment_action: paymentAction?.kind,
			photos: photoCount,
			product_ids: reply?.productIds ?? [],
			reply_text: reply?.text,
			step_ms: stepMs,
			steps: result.steps.length,
			thread,
			tokens_cached: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
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

	private async handleUnreadablePhotos(opts: {
		attempt: number;
		inputs: number;
		persistedUserMessage: ModelMessage;
		rows: Array<InboxRow>;
		started: number;
		thread: string;
		turnId: string;
	}): Promise<void> {
		const { attempt, inputs, persistedUserMessage, rows, started, thread, turnId } = opts;
		this.store.persistTurn(turnId, persistedUserMessage, [], false);
		await this.sendPart(`${turnId}:text`, { message: IMAGE_UNREADABLE });
		this.finishTurn(rows);
		turnLog({
			attempt,
			conversation: this.conversationId(),
			handoff: false,
			inputs,
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
	}

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
			handoffMessage: saved.handoffMessage,
			handoffReason: saved.handoff,
			paymentAction: saved.payment,
			reply: saved.reply,
			superseded: saved.superseded ?? false,
			turnId,
		});
		this.finishTurn(rows);
		turnLog({
			action: saved.reply?.action,
			ad_id: this.store.getMeta("ad_id"),
			attempt,
			conversation: this.conversationId(),
			handoff: saved.handoff !== undefined,
			inputs: items.length,
			model: modelName(this.env),
			outcome,
			payment_action: saved.payment?.kind,
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
		if (superseded) {
			return "superseded";
		}
		if (this.store.isPaused()) {
			return "paused_drop";
		}
		if (handoffReason !== undefined) {
			if (handoffMessage && handoffMessage.trim().length > 0) {
				await this.sendPart(`${turnId}:handoff_msg`, { message: handoffMessage.trim() });
			}
			await this.handoffToAdmin(handoffReason, `${turnId}:handoff`);
			return "handoff";
		}
		if (paymentAction !== undefined) {
			this.store.clearLastOutbound();
			return this.payments.dispatchPaymentAction(turnId, paymentAction, receiptUrl);
		}
		await this.sendReply(reply, turnId);
		if (reply?.action === "confirm") {
			await this.checkoutFlow.sendConfirmOrNeed(`${turnId}:confirm`);
		} else {
			this.store.clearLastOutbound();
		}
		return reply === undefined ? "no_reply" : "sent";
	}

	private async sendReply(reply: ReplyResult | undefined, turnId: string): Promise<void> {
		const shown = await renderTurn({
			accountId: this.accountId(),
			conversationId: this.conversationId(),
			env: this.env,
			hasSent: (key) => this.store.outboxHas(key),
			markSent: (key) => this.store.markOutbox(key),
			reply: reply ?? { text: FALLBACK_TEXT },
			turnId,
		});
		if (shown.length > 0) {
			this.store.markSeen(shown);
		}
	}

	// ─── Shared helpers ──────────────────────────────────────────────────────

	private async sendPart(key: string, body: Omit<ZernioSendBody, "accountId">): Promise<void> {
		if (this.store.outboxHas(key)) {
			return;
		}
		await send(this.env, this.conversationId(), { accountId: this.accountId(), ...body }, key);
		this.store.markOutbox(key);
	}

	private async handoffToAdmin(
		reason: string,
		sendKey: string,
		extraLines?: Array<string>,
	): Promise<void> {
		this.store.clearLastOutbound();
		await this.sendPart(sendKey, { message: HANDOFF });
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
		this.store.setMeta("paused_until", String(Date.now() + PAUSE_MS));
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

	// Pause immediately when Zernio attributes an outgoing message to "human".
	// Ambiguous null echoes still settle for 15s to avoid self-pausing on our own send.
	private async pauseIfHumanReplied(): Promise<void> {
		if (this.store.isPaused()) {
			return;
		}
		const now = Date.now();
		try {
			const messages = await listMessages(
				this.env,
				this.conversationId(),
				this.accountId(),
				20,
				AbortSignal.timeout(3000),
			);
			const resumedAt = Number(this.store.getMeta("resumed_at") ?? "0");
			const humanMsg = messages.find((m) => {
				if (m.direction !== "outgoing") {
					return false;
				}
				const at = Date.parse(m.createdAt ?? "");
				if (!Number.isFinite(at) || at <= resumedAt) {
					return false;
				}
				if (m.sentVia === "human") {
					return true;
				}
				return m.sentVia === null && now - at > HUMAN_SETTLE_MS;
			});
			const humanAt = humanMsg ? Date.parse(humanMsg.createdAt ?? "") : undefined;
			if (humanAt === undefined || humanAt + PAUSE_MS <= now) {
				return;
			}
			this.store.setMeta("paused_until", String(humanAt + PAUSE_MS));
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

	private async prefillDeliveryFromHistory(): Promise<void> {
		if (this.store.getMeta("history_checked") !== undefined) {
			return;
		}
		this.store.setMeta("history_checked", "1");
		const client = botClient(this.env);
		if (this.store.checkoutRow().phone !== null || client === undefined) {
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
			for (const phone of candidates.slice(0, 3)) {
				try {
					const customer = await client.customer.getCustomerByPhone.query(
						{ phone: Number(phone) },
						{ signal: budget },
					);
					if (customer.address) {
						this.store.saveDelivery({ address: customer.address, phone });
						prefillLog("found", this.name);
						return;
					}
				} catch {
					// Try next candidate.
				}
			}
			prefillLog("none", this.name);
		} catch {
			prefillLog("error", this.name);
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
		const matchesAd = hits.some((h) => adKeys.has(listingKey(h.name)));
		if (!matchesAd) {
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

	private async buildUserMessages(items: Array<InboundItem>): Promise<{
		firstPhotoUrl: string | undefined;
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
		const firstPhotoUrl =
			items
				.flatMap((i) => i.attachments ?? [])
				.find(
					(a) => a.type === "image" && a.url !== undefined && a.url !== null && a.url.length > 0,
				)?.url ?? undefined;
		const hadPhotos = firstPhotoUrl !== undefined;
		const imageParts = (
			await Promise.all(items.map((i) => fetchImageParts(this.env, i.attachments ?? [])))
		).flat();
		const userParts: Array<ImagePart | TextPart> = [
			...(text.length > 0 ? [{ text, type: "text" as const }] : []),
			...imageParts,
		];
		return {
			firstPhotoUrl,
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

	private extractReply(
		steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>,
	): ReplyResult | undefined {
		for (const step of [...steps].reverse()) {
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

	private extractHandoff(
		steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>,
	): HandoffResult | undefined {
		for (const step of [...steps].reverse()) {
			for (const call of [...step.toolCalls].reverse()) {
				if (call.toolName === "handoff") {
					const parsed = v.safeParse(handoffInputSchema, call.input);
					return parsed.success ? parsed.output : { reason: "unspecified" };
				}
			}
		}
		return undefined;
	}

	private extractPaymentAction(
		steps: Array<{ toolResults: Array<{ output: unknown; toolName: string }> }>,
	): PaymentAction | undefined {
		for (const step of [...steps].reverse()) {
			for (const res of [...step.toolResults].reverse()) {
				if (res.toolName === "payment") {
					const parsed = v.safeParse(paymentResultSchema, res.output);
					if (parsed.success && parsed.output.handled && parsed.output.action !== undefined) {
						return parsed.output.action;
					}
				}
			}
		}
		return undefined;
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

	private noteAdId(
		metadata: { referral?: { ad_id?: string } | null | undefined } | null | undefined,
	): void {
		const adId = metadata?.referral?.ad_id;
		if (adId !== undefined && adId.length > 0 && this.store.getMeta("ad_id") === undefined) {
			this.store.setMeta("ad_id", adId);
		}
	}

	private finishTurn(rows: Array<InboxRow>): void {
		for (const row of rows) {
			this.store.markInboxDone(row.event_id);
		}
	}

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

	private messageText(message: ModelMessage): string {
		if (!Array.isArray(message.content)) {
			return message.content;
		}
		return message.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join(" ");
	}

	private conversationId(): string {
		const name = this.name ?? "";
		return name.slice(name.indexOf(":", "zernio:".length) + 1);
	}

	private accountId(): string {
		const name = this.name ?? "";
		return name.slice("zernio:".length, name.indexOf(":", "zernio:".length));
	}
}
