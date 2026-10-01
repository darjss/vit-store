import { defineTool, dispatch } from "@flue/runtime";
import {
	type AssistantProduct,
	buildPaymentChoice,
	type Cart,
	type CreatedOrder,
	cartQuickReplies,
	claimTransferPayload,
	formatCartSummary,
	isTransferDoneText,
	type PaymentRef,
	type ProductCard,
	parseChooseTransferPayload,
	parseClaimTransferPayload,
	setTransferStatus,
	TRANSFER_CLAIM_ACK_MESSAGE,
	TRANSFER_DONE_BUTTON_TITLE,
	type TransferStatus,
} from "@vit/assistant";
import type { Context } from "hono";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import type { ChannelSendResult } from "../lib/channel-send";
import { getAssistantProductsByIds } from "../lib/catalog";
import { stageInboundImage } from "../lib/messenger-inbound";
import { claimTransfer, fetchPaymentSummary } from "../lib/payment";
import { detectCartEvent, handleCartEvent } from "./cart-handler";
import { cartSessionFor } from "./cart-session";
import { checkoutSessionFor } from "./checkout-session";
import {
	admitMessengerImageMessage,
	admitMessengerTextMessage,
	claimInboundOnce,
	conversationKey,
	conversationRefFor,
	releaseInboundClaim,
	extractInboundImages,
	type MessengerConversationRef,
} from "./messenger-admission";
import {
	handleChooseTransfer,
	handleTransferClaim,
	type PaymentHandlerDeps,
} from "./payment-handler";

export {
	conversationKey,
	parseConversationKey,
	type MessengerConversationRef,
} from "./messenger-admission";

// Worker bindings the Messenger webhook reaches through the Hono context.
type WebhookEnv = {
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

const ZERNIO_API_KEY = requiredEnv("ZERNIO_API_KEY");
const ZERNIO_WEBHOOK_SECRET = requiredEnv("ZERNIO_WEBHOOK_SECRET");
const ZERNIO_ACCOUNT_ID = requiredEnv("ZERNIO_ACCOUNT_ID");
// Local dev seam: when set, outbound Zernio calls are redirected to a capture
// endpoint (see apps/agent/cli/messenger-dev.ts) so the real send path runs
// without touching Zernio. Unset in production -> real API host.
const ZERNIO_BASE_URL = (process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api").replace(
	/\/+$/,
	"",
);

// Mongolian apology when an inbound photo can't be fetched (expired CDN url /
// oversized). Keeps the customer in the conversation instead of silently
// dropping their picture.
const PHOTO_FETCH_FAILED_MESSAGE =
	"Уучлаарай, таны илгээсэн зургийг боловсруулж чадсангүй. Барааны нэрийг бичих эсвэл зургаа дахин илгээнэ үү.";

// Events older than this are dropped: Zernio retries a failed webhook inside a
// short window, so anything older is a replay of a turn we already finished or
// abandoned.
const STALE_EVENT_WINDOW_MS = 3 * 60_000;

// ─── Inbound event shape (valibot: only the fields we read) ──────────────────

const referralSchema = v.looseObject({
	ad_id: v.optional(v.string()),
	ref: v.optional(v.string()),
	source: v.optional(v.string()),
});

const zernioMessageEventSchema = v.looseObject({
	// Event UUID, identical on every retry: our dedupe key.
	account: v.looseObject({
		accountId: v.optional(v.string()),
		id: v.pipe(v.string(), v.minLength(1)),
	}),
	conversation: v.looseObject({
		id: v.pipe(v.string(), v.minLength(1)),
		platformConversationId: v.optional(v.string()),
	}),
	event: v.literal("message.received"),
	id: v.pipe(v.string(), v.minLength(1)),
	message: v.looseObject({
		attachments: v.optional(
			v.array(
				v.looseObject({
					type: v.string(),
					url: v.optional(v.nullable(v.string())),
				}),
			),
		),
		conversationId: v.optional(v.string()),
		direction: v.string(),
		id: v.optional(v.string()),
		platform: v.string(),
		sender: v.optional(v.looseObject({ id: v.string() })),
		text: v.nullable(v.string()),
	}),
	timestamp: v.string(),
	// Postback taps and quick-reply taps arrive as message.received carrying
	// these payload fields; strings come back exactly as we sent them.
	metadata: v.nullish(
		v.looseObject({
			postbackPayload: v.optional(v.string()),
			quickReplyPayload: v.optional(v.string()),
			referral: v.optional(referralSchema),
		}),
	),
});

export type ZernioMessageEvent = v.InferOutput<typeof zernioMessageEventSchema>;

const envelopeSchema = v.looseObject({ event: v.optional(v.string()) });

// Only real customer inbound on our connected Zernio account continues to
// routing. Everything else (outgoing, other platforms, other accounts) is a
// quiet 200 so Zernio stops retrying it.
const isInboundForUs = (event: ZernioMessageEvent): boolean =>
	event.message.direction === "incoming" &&
	event.message.platform === "facebook" &&
	conversationRefFor(event).accountId === ZERNIO_ACCOUNT_ID;

// ─── Signature verification ─────────────────────────────────────────────────

const hexToBytes = (hex: string): Uint8Array | undefined => {
	if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
		return undefined;
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
};

let hmacKeyPromise: Promise<CryptoKey> | undefined;
const hmacKey = (): Promise<CryptoKey> => {
	if (hmacKeyPromise === undefined) {
		hmacKeyPromise = crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(ZERNIO_WEBHOOK_SECRET),
			{ hash: "SHA-256", name: "HMAC" },
			false,
			["verify"],
		);
	}
	return hmacKeyPromise;
};

const verifySignature = async (rawBody: string, header: string | undefined): Promise<boolean> => {
	if (!header) {
		return false;
	}
	const hex = header.startsWith("sha256=") ? header.slice(7) : header;
	const signature = hexToBytes(hex);
	if (signature === undefined) {
		return false;
	}
	try {
		return await crypto.subtle.verify(
			"HMAC",
			await hmacKey(),
			signature,
			new TextEncoder().encode(rawBody),
		);
	} catch {
		return false;
	}
};

// ─── Webhook ─────────────────────────────────────────────────────────────────

// Mounted at POST /channels/messenger/webhook. Signature-gated, then the same
// deterministic routing order as before: cart buttons -> payment buttons ->
// photo turn -> text turn. Any throw past signature verification returns 500 so
// Zernio retries the event (dedupe claims are released on the failure paths).
export async function messengerWebhook(c: Context): Promise<Response> {
	// SAFETY: Workers passes the wrangler bindings object as c.env; WebhookEnv
	// lists the optional ones read here.
	const env = c.env as WebhookEnv;
	const rawBody = await c.req.text();
	if (!(await verifySignature(rawBody, c.req.header("x-zernio-signature")))) {
		return c.text("invalid signature", 401);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return c.text("ok", 200);
	}
	const envelope = v.safeParse(envelopeSchema, payload);
	if (!envelope.success || envelope.output.event !== "message.received") {
		return c.text("ok", 200);
	}
	const parsed = v.safeParse(zernioMessageEventSchema, payload);
	if (!parsed.success) {
		console.error("[zernio.unparsed]", parsed.issues);
		return c.text("ok", 200);
	}
	const event = parsed.output;

	if (!isInboundForUs(event)) {
		return c.text("ok", 200);
	}

	const ageMs = Date.now() - Date.parse(event.timestamp);
	if (!Number.isFinite(ageMs) || ageMs > STALE_EVENT_WINDOW_MS) {
		console.log(`[zernio.stale] event=${event.id} timestamp=${event.timestamp}`);
		return c.text("ok", 200);
	}

	const adId = event.metadata?.referral?.ad_id;
	if (adId) {
		console.log(`[zernio.referral] ad_id=${adId} conversation=${event.conversation.id}`);
	}

	// Cart buttons (Захиалах postback + cart_* controls) are handled
	// deterministically ahead of the text path, so they never reach the model:
	// add/view/adjust/remove/confirm run with no LLM turn (and thus run under
	// local miniflare where `env.AI` is unavailable).
	if (await tryHandleCartEvent(event, env)) {
		return c.text("ok", 200);
	}
	// Post-order payment surface (#25): the QPay/transfer button taps, a
	// "Шилжүүлсэн" claim, and (within the transfer context) a "хийсэн" text or a
	// screenshot are handled deterministically here, ahead of the photo/text
	// paths, so a transfer claim never reaches the model and never touches a
	// payment-confirmation API.
	if (await tryHandlePaymentEvent(event, env)) {
		return c.text("ok", 200);
	}
	// Photo turns: trusted channel code fetches the attachment, stages it under
	// messenger-inbound/ in R2, and dispatches ONLY the key (#20).
	if (await dispatchInboundImage(event, env)) {
		return c.text("ok", 200);
	}
	await dispatchInboundText(event, env);
	return c.text("ok", 200);
}

type MessengerDispatchInput = {
	attachmentTypes: Array<string>;
	messageId: string;
	quickReplyPayload?: string;
	text: string;
	type: "messenger.message";
};

// Admits a plain inbound text turn and dispatches it to the customer agent.
async function dispatchInboundText(event: ZernioMessageEvent, env: WebhookEnv): Promise<void> {
	const admission = await admitMessengerTextMessage({ env, event });
	if (admission === undefined) {
		return;
	}

	// dispatch() is the durable commit point. If it throws before the turn is
	// durably enqueued, release the dedupe claim and rethrow so Zernio's retry
	// can re-deliver instead of being swallowed by dedupe.
	// dispatch() input must be JSON-clean: quickReplyPayload is only added when
	// a quick reply exists rather than passing an explicit undefined.
	const input: MessengerDispatchInput = {
		attachmentTypes: admission.attachmentTypes,
		messageId: admission.messageId,
		text: admission.text,
		type: "messenger.message",
	};
	if (admission.quickReplyPayload !== undefined) {
		input.quickReplyPayload = admission.quickReplyPayload;
	}
	try {
		await dispatch(assistant, {
			id: admission.sessionId,
			input,
		});
	} catch (error) {
		await admission.release();
		throw error;
	}
}

// Admits an inbound photo turn: fetches each attachment server-side, stages it
// under the short-lived messenger-inbound/ R2 prefix, and dispatches the
// customer-agent turn carrying ONLY the R2 key(s) — never a CDN url or base64
// (ADR 0003, #20). Returns true when the event was an image message (consumed),
// false for non-image messages so the webhook falls through to the text path.
async function dispatchInboundImage(event: ZernioMessageEvent, env: WebhookEnv): Promise<boolean> {
	// Extract once and pass the array through to admission so the webhook
	// doesn't scan attachments twice per event.
	const images = extractInboundImages(event);
	if (images.length === 0) {
		return false;
	}

	// Resolve the bucket BEFORE claiming the event: a missing binding is a
	// production misconfig that must fail loud (like the cart/admission stores),
	// leaving the event unclaimed so Zernio's retry is honored.
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error("MESSENGER_INBOUND_BUCKET binding is required for inbound Messenger photos.");
	}

	const admission = await admitMessengerImageMessage({
		env,
		event,
		images,
	});
	if (admission === undefined) {
		return true;
	}

	try {
		const imageKeys: Array<string> = [];
		for (const image of admission.images) {
			const staged = await stageInboundImage(
				bucket,
				{
					index: image.index,
					messageId: admission.messageId,
					sessionId: admission.sessionId,
				},
				image.url,
			);
			if (staged !== undefined) {
				imageKeys.push(staged.key);
			}
		}

		// Nothing staged (expired/oversized url). Keep the claim so a retry of
		// the same dead url doesn't re-apologize, and tell the customer.
		if (imageKeys.length === 0) {
			await sendTextReply(admission.conversation)(PHOTO_FETCH_FAILED_MESSAGE);
			return true;
		}

		await dispatch(assistant, {
			id: admission.sessionId,
			input: {
				messageId: admission.messageId,
				text: admission.caption,
				type: "messenger.message",
				// Derive from the STAGED keys, not every attempted attachment, so the
				// reported type count can't diverge from imageKeys.
				attachmentTypes: imageKeys.map(() => "image"),
				// The dispatch input carries R2 KEYS, never the CDN url or any
				// base64 payload (#20 acceptance criterion).
				imageKeys,
			},
		});
	} catch (error) {
		await admission.release();
		throw error;
	}
	return true;
}

// Handles a Messenger event if it is a cart button/quick-reply, returning true
// when consumed (so the webhook skips the text path). Returns false for plain
// turns. Dedupe on the Zernio event id makes a webhook retry idempotent for an
// add.
async function tryHandleCartEvent(event: ZernioMessageEvent, env: WebhookEnv): Promise<boolean> {
	const cartEvent = detectCartEvent(event);
	if (cartEvent === undefined) {
		return false;
	}

	const conversation = conversationRefFor(event);
	const sessionId = conversationKey(conversation);

	// Resolve the cart store BEFORE claiming the event: a missing binding is a
	// production misconfig that must fail loud (like the admission store does),
	// not silently swallow the customer's tap and burn the event id. Throwing
	// here — ahead of the claim — leaves the event unclaimed so Zernio's retry
	// is honored.
	const cart = cartSessionFor(env.CART_STORE, sessionId);
	if (cart === undefined) {
		throw new Error("CART_STORE binding is required for Messenger cart events.");
	}

	const claimKey = `messenger:cart:v1:${sessionId}:mid:${cartEvent.mid}`;
	if (cartEvent.mid.length > 0 && !(await claimInboundOnce(claimKey, env))) {
		return true;
	}

	try {
		await handleCartEvent(cartEvent, {
			cart,
			resolveProduct: resolveProductById,
			sendCartSummary: sendCartSummary(conversation),
			sendText: sendTextReply(conversation),
		});
	} catch (error) {
		// Release the claim so Zernio's retry can re-apply the dropped event.
		if (cartEvent.mid.length > 0) {
			await releaseInboundClaim(claimKey, env);
		}
		throw error;
	}
	return true;
}

// Public storefront origin the QPay-only page (#24) lives on. The store tRPC
// router and the storefront share one origin (storev2 mounts `/trpc/store`), so
// this defaults to the store API base; `STORE_PUBLIC_URL` overrides it when they
// diverge.
const storePublicUrl = (): string => {
	const base = process.env.STORE_PUBLIC_URL ?? process.env.STORE_API_URL ?? "http://localhost:3000";
	return base.replace(/\/+$/, "");
};

// ─── Zernio outbound ─────────────────────────────────────────────────────────

type ZernioButton = {
	payload?: string;
	title: string;
	type: "url" | "postback";
	url?: string;
};

type ZernioSendBody = {
	accountId: string;
	buttons?: Array<ZernioButton>;
	message?: string;
	quickReplies?: Array<{ payload: string; title: string }>;
	template?: {
		elements: Array<{
			buttons?: Array<ZernioButton>;
			imageUrl?: string;
			subtitle?: string;
			title: string;
		}>;
		type: "generic";
	};
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The single outbound choke point: POST a message to one Zernio inbox
// conversation. The Idempotency-Key is generated once per logical send and
// reused on the (single) retry, so a slow-but-delivered send can't double-post
// the way Graph's blind SDK retries did. Retries exactly once on network
// error, 5xx, or 429 (Retry-After capped at 5s); a non-2xx after that throws.
// Returns the Zernio messageId, or null when the response doesn't carry one.
async function zernioSend(
	conversationId: string,
	body: Omit<ZernioSendBody, "accountId">,
): Promise<string | null> {
	// Outbound capture at the single choke point: log every text the bot sends.
	// This is prod observability of what the bot actually says, and it lets a
	// CLI dogfood read the bot's replies from `wrangler tail` / Workers Logs
	// WITHOUT the message being delivered.
	if (body.message) {
		console.log(`[bot.say] ${body.message.replaceAll("\n", " ⏎ ").slice(0, 700)}`);
	}

	const idempotencyKey = crypto.randomUUID();
	const payload: ZernioSendBody = { accountId: ZERNIO_ACCOUNT_ID, ...body };
	const url = `${ZERNIO_BASE_URL}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`;

	let status = 0;
	let errorText = "";
	for (let attempt = 0; attempt < 2; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, {
				body: JSON.stringify(payload),
				headers: {
					authorization: `Bearer ${ZERNIO_API_KEY}`,
					"content-type": "application/json",
					"idempotency-key": idempotencyKey,
				},
				method: "POST",
			});
		} catch (error) {
			if (attempt === 0) {
				await sleep(1000);
				continue;
			}
			throw error;
		}
		if (response.ok) {
			const parsed = v.safeParse(
				zernioSendResponseSchema,
				await response.json().catch(() => undefined),
			);
			return parsed.success ? (parsed.output.data?.messageId ?? null) : null;
		}
		status = response.status;
		errorText = await response.text();
		if (attempt === 0 && (status === 429 || status >= 500)) {
			await sleep(retryDelayMs(response));
			continue;
		}
		break;
	}
	throw new Error(`Zernio send failed: ${status} ${errorText}`);
}

const zernioSendResponseSchema = v.looseObject({
	data: v.optional(v.looseObject({ messageId: v.optional(v.string()) })),
});

// 429 honors Retry-After capped at 5s; 5xx and network errors wait 1s.
const retryDelayMs = (response: Response): number => {
	if (response.status !== 429) {
		return 1000;
	}
	const retryAfter = Number(response.headers.get("retry-after"));
	return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1000;
};

// Best-effort typing indicator (Zernio has no "typing off"; it clears on the
// next send). Cosmetic: never fail a reply over one.
async function zernioTyping(conversationId: string): Promise<void> {
	try {
		await fetch(
			`${ZERNIO_BASE_URL}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/typing`,
			{
				body: JSON.stringify({ accountId: ZERNIO_ACCOUNT_ID }),
				headers: {
					authorization: `Bearer ${ZERNIO_API_KEY}`,
					"content-type": "application/json",
				},
				method: "POST",
			},
		);
	} catch {
		// ignore
	}
}

// Maps the channel-neutral payment-choice buttons to the Zernio button shape
// (web_url -> "url", postback -> "postback").
const toZernioButtons = (
	buttons: ReturnType<typeof buildPaymentChoice>["buttons"],
): Array<ZernioButton> =>
	buttons.flatMap((b): Array<ZernioButton> => {
		if (b.type === "web_url") {
			// buildPaymentChoice always sets url on a web_url button; skip rather
			// than send a malformed button if that contract ever breaks.
			return b.url ? [{ title: b.title, type: "url", url: b.url }] : [];
		}
		return b.payload ? [{ payload: b.payload, title: b.title, type: "postback" }] : [];
	});

// Post-order payment choices (#25): a button message offering QPay (url button
// to the QPay-only page) and bank transfer (postback). Bound to one
// conversation; injected into the checkout tools' `place_order` so the offer is
// sent right after the order confirmation.
export function sendPaymentChoices(ref: MessengerConversationRef) {
	return async (order: CreatedOrder): Promise<ChannelSendResult | undefined> => {
		if (!order.paymentNumber) {
			return undefined;
		}
		const choice = buildPaymentChoice(storePublicUrl(), {
			checkoutToken: order.checkoutToken,
			paymentNumber: order.paymentNumber,
		});
		const messageId = await zernioSend(ref.conversationId, {
			buttons: toZernioButtons(choice.buttons),
			message: choice.text,
		});
		return { messageId, ok: true };
	};
}

// Bank-transfer details (#25): the account/amount/reference text plus a single
// `Шилжүүлсэн` postback button the customer taps to lodge a transfer claim.
export function sendBankTransferDetails(ref: MessengerConversationRef) {
	return async (text: string, paymentRef: PaymentRef): Promise<ChannelSendResult> => {
		const messageId = await zernioSend(ref.conversationId, {
			buttons: [
				{
					payload: claimTransferPayload(paymentRef),
					title: TRANSFER_DONE_BUTTON_TITLE,
					type: "postback",
				},
			],
			message: text,
		});
		return { messageId, ok: true };
	};
}

// Binds the post-order payment handler dependencies to one conversation: the
// store-API boundary (summary + claim), the two channel senders, and best-effort
// transfer-status persistence on the per-session checkout record.
function paymentDepsFor(
	conversation: MessengerConversationRef,
	checkout: ReturnType<typeof checkoutSessionFor>,
): PaymentHandlerDeps {
	return {
		fetchPaymentSummary: async (ref) => {
			const summary = await fetchPaymentSummary(ref.paymentNumber, ref.checkoutToken);
			return { amount: summary.total, reference: summary.order.customerPhone };
		},
		// The ONLY payment write a claim performs — records the claim, never
		// confirms (ADR 0004).
		claimTransfer: (ref) => claimTransfer(ref.paymentNumber, ref.checkoutToken),
		sendBankDetails: sendBankTransferDetails(conversation),
		sendText: sendTextReply(conversation),
		setTransferStatus: checkout
			? async (status: TransferStatus) => {
					const current = await checkout.getCheckout();
					if (current) {
						await checkout.saveCheckout(setTransferStatus(current, status));
					}
				}
			: undefined,
	};
}

// Handles a post-order payment event deterministically (no model). Returns true
// when consumed. Covers: the `Дансаар шилжүүлэх` choice (postback), and a
// transfer CLAIM via the `Шилжүүлсэн` button, a "хийсэн"/"hiisen" text, or a
// screenshot — but the latter two only inside the transfer context recorded on
// the checkout session. A claim records `customer_claimed_paid` and NEVER calls
// a payment-confirmation API.
async function tryHandlePaymentEvent(event: ZernioMessageEvent, env: WebhookEnv): Promise<boolean> {
	const conversation = conversationRefFor(event);
	const sessionId = conversationKey(conversation);
	const checkout = checkoutSessionFor(env.CHECKOUT_STORE, sessionId);
	// The Zernio event id is stable across retries, so it's the dedupe key for
	// button taps and free-text claims alike.
	const mid = event.id;
	const deps = () => paymentDepsFor(conversation, checkout);

	// 1. Button taps carry the payment ref in the payload — fully self-contained.
	const postback = detectPaymentPostback(event);
	if (postback) {
		const run =
			postback.kind === "choose"
				? () => handleChooseTransfer(postback.ref, deps())
				: () => handleTransferClaim(postback.ref, deps());
		return runPaymentTransition(env, mid, sessionId, run);
	}

	// 2. Free-text "хийсэн"/"hiisen" or a screenshot — a claim ONLY inside the
	// transfer context recorded on the checkout session. Without a payment
	// context (or store binding) fall through to the normal paths.
	if (checkout === undefined) {
		return false;
	}
	const claim = await resolveContextualClaim(event, checkout);
	if (claim === undefined) {
		return false;
	}
	const d = deps();
	// Already claimed: just re-acknowledge, do not re-record (avoid re-notifying
	// admin on a repeated "хийсэн").
	const run = claim.alreadyClaimed
		? () => d.sendText(TRANSFER_CLAIM_ACK_MESSAGE).then(() => undefined)
		: () => handleTransferClaim(claim.ref, d);
	return runPaymentTransition(env, mid, sessionId, run);
}

// Decodes a payment button tap from a postback/quick-reply payload into the
// transition kind + its payment ref, or undefined when it is not one.
function detectPaymentPostback(
	event: ZernioMessageEvent,
): { kind: "choose" | "claim"; ref: PaymentRef } | undefined {
	const payload = event.metadata?.postbackPayload ?? event.metadata?.quickReplyPayload;
	if (!payload) {
		return undefined;
	}
	const choose = parseChooseTransferPayload(payload);
	if (choose) {
		return { kind: "choose", ref: choose };
	}
	const claim = parseClaimTransferPayload(payload);
	if (claim) {
		return { kind: "claim", ref: claim };
	}
	return undefined;
}

// Resolves a contextual (non-button) transfer claim — a "хийсэн" text or a
// screenshot — against the persisted transfer context. A screenshot claims only
// on the bank-details screen (`transfer_pending`); a text claims from the moment
// the choices were offered. Returns undefined when this is not a claim.
async function resolveContextualClaim(
	event: ZernioMessageEvent,
	checkout: NonNullable<ReturnType<typeof checkoutSessionFor>>,
): Promise<{ alreadyClaimed: boolean; ref: PaymentRef } | undefined> {
	const isClaimText = isTransferDoneText(event.message.text ?? undefined);
	const hasImage = extractInboundImages(event).length > 0;
	if (!isClaimText && !hasImage) {
		return undefined;
	}

	const payment = (await checkout.getCheckout())?.payment;
	if (!payment) {
		return undefined;
	}
	const inImageContext = hasImage && payment.transferStatus === "transfer_pending";
	// A "хийсэн" text is a claim at any post-order transfer status (offered /
	// pending / already-claimed).
	if (!inImageContext && !isClaimText) {
		return undefined;
	}

	return {
		alreadyClaimed: payment.transferStatus === "transfer_claimed",
		ref: {
			checkoutToken: payment.checkoutToken ?? null,
			paymentNumber: payment.paymentNumber,
		},
	};
}

// Runs a payment transition under the same dedupe discipline as the cart path:
// claim the event id first (idempotent on a Zernio retry), release it on
// failure so the retry is honored. Always returns true (the event is consumed).
async function runPaymentTransition(
	env: WebhookEnv,
	mid: string,
	sessionId: string,
	run: () => Promise<ChannelSendResult | void>,
): Promise<boolean> {
	const claimKey = `messenger:payment:v1:${sessionId}:mid:${mid}`;
	if (mid.length > 0 && !(await claimInboundOnce(claimKey, env))) {
		return true;
	}
	try {
		await run();
	} catch (error) {
		if (mid.length > 0) {
			await releaseInboundClaim(claimKey, env);
		}
		throw error;
	}
	return true;
}

export function postMessage(ref: MessengerConversationRef) {
	return defineTool({
		description: "Post a simple text reply to the bound Messenger customer conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		name: "post_messenger_message",
		async run({ input }) {
			await zernioTyping(ref.conversationId);
			const messageId = await zernioSend(ref.conversationId, {
				message: input.text,
			});
			return { messageId, ok: true };
		},
	});
}

// Plain text sender bound to a conversation. Used by the product-search tool's
// no-match path; mirrors the send shape of post_messenger_message.
export function sendTextReply(ref: MessengerConversationRef) {
	return async (text: string): Promise<ChannelSendResult> => {
		const messageId = await zernioSend(ref.conversationId, { message: text });
		return { messageId, ok: true };
	};
}

// Sends the cart summary as a text message carrying the cart-control quick
// replies (✅ confirm / 🗑 clear and per-item ➕ ➖ ✖). Tapping a quick reply
// delivers its payload back on the webhook, where `detectCartEvent` routes it
// straight to the cart reducer — no model turn. Bound to one conversation.
export function sendCartSummary(ref: MessengerConversationRef) {
	return async (cart: Cart): Promise<ChannelSendResult> => {
		const quickReplies = cartQuickReplies(cart).map((qr) => ({
			payload: qr.payload,
			title: qr.title,
		}));
		const body: Omit<ZernioSendBody, "accountId"> = { message: formatCartSummary(cart) };
		if (quickReplies.length > 0) {
			body.quickReplies = quickReplies;
		}
		const messageId = await zernioSend(ref.conversationId, body);
		return { messageId, ok: true };
	};
}

// Resolves a single product id to the shared assistant projection for cart
// lines. Reuses the by-id catalog boundary (no duplicated catalog logic).
export async function resolveProductById(id: number): Promise<AssistantProduct | undefined> {
	const [product] = await getAssistantProductsByIds([id]);
	return product;
}

// Sends channel-neutral product cards as a Zernio generic template. Each
// element carries the product's Захиалах postback button whose payload holds
// the product id. Generic templates allow at most 10 elements.
export function sendProductCards(ref: MessengerConversationRef) {
	return async (cards: Array<ProductCard>): Promise<ChannelSendResult & { cardCount: number }> => {
		const elements = cards.slice(0, 10).map((card) => {
			const element: NonNullable<NonNullable<ZernioSendBody["template"]>["elements"]>[number] = {
				buttons: [
					{
						payload: card.button.payload,
						title: card.button.label,
						type: "postback",
					},
				],
				subtitle: card.subtitle,
				title: card.title,
			};
			if (card.imageUrl) {
				element.imageUrl = card.imageUrl;
			}
			return element;
		});

		console.log(
			`[bot.cards] ${elements
				.map((e) => e.title)
				.join(" | ")
				.slice(0, 700)}`,
		);
		try {
			const messageId = await zernioSend(ref.conversationId, {
				template: { elements, type: "generic" },
			});
			return {
				cardCount: elements.length,
				messageId,
				ok: true,
			};
		} catch (error) {
			// Cards are best-effort: the catalog search already succeeded, so a
			// transient send failure (or an unreachable test conversation during
			// dogfooding) must NOT throw out of the tool and make the model
			// apologise that the search itself failed. Log and report the cards as
			// produced.
			console.warn(
				`[bot.cards] send failed (best-effort): ${error instanceof Error ? error.message : String(error)}`,
			);
			return { cardCount: elements.length, messageId: null, ok: true };
		}
	};
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is required.`);
	}
	return value;
}
