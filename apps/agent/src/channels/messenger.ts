import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
	type MessengerParticipantRef,
} from "@flue/messenger";
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
import { Messenger, type Recipient } from "@warriorteam/messenger-sdk";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
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
	extractInboundImages,
	releaseInboundClaim,
} from "./messenger-admission";
import {
	handleChooseTransfer,
	handleTransferClaim,
	type PaymentHandlerDeps,
} from "./payment-handler";

// Worker bindings the Messenger webhook reaches through the Hono context.
type WebhookEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

// Mongolian apology when an inbound photo can't be fetched from Meta (expired
// CDN url / oversized). Keeps the customer in the conversation instead of
// silently dropping their picture.
const PHOTO_FETCH_FAILED_MESSAGE =
	"Уучлаарай, таны илгээсэн зургийг боловсруулж чадсангүй. Барааны нэрийг бичих эсвэл зургаа дахин илгээнэ үү.";

const graphVersion = "v25.0";

export const messenger = new Messenger({
	accessToken: requiredEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
	version: graphVersion,
	// Graph's Send API has NO idempotency key, and the SDK defaults to maxRetries:3
	// on timeout/network/5xx. A slow send (client aborts at 30s) is often ALREADY
	// delivered by Meta, so a blind retry posts a DUPLICATE message to the customer
	// — the root of the "same reply 3×" reports. Every outbound send here (text,
	// cards, typing) is non-idempotent and best-effort, so never auto-retry: one
	// attempt, and the caller's bestEffort wrappers tolerate a rare dropped send.
	maxRetries: 0,
	// Local dev seam: when set, outbound Graph Send API calls are redirected to
	// a capture endpoint (see apps/agent/cli/messenger-dev.ts) so the real send
	// path runs without touching Meta. Unset in production -> real Graph host.
	...(process.env.MESSENGER_GRAPH_BASE_URL
		? { baseUrl: process.env.MESSENGER_GRAPH_BASE_URL }
		: {}),
});

// Outbound capture at the single SDK choke point: log every text the bot sends.
// This is prod observability of what the bot actually says, and it lets a CLI
// dogfood read the bot's replies from `wrangler tail` / Workers Logs WITHOUT the
// message being delivered (drive the webhook with a non-deliverable test PSID).
const _sendMessage = messenger.send.message.bind(messenger.send);
// biome-ignore lint/suspicious/noExplicitAny: intentional thin send wrapper.
(messenger.send as any).message = async (body: any, opts: any) => {
	const text = body?.message?.text;
	if (typeof text === "string" && text.length > 0) {
		console.log(`[bot.say] ${text.replace(/\n/g, " ⏎ ").slice(0, 700)}`);
	}
	return _sendMessage(body, opts);
};

export function toRecipient(ref: MessengerParticipantRef): Recipient {
	return ref.type === "page-scoped-id" ? { id: ref.id } : { user_ref: ref.id };
}

export const channel: MessengerChannel = createMessengerChannel({
	appSecret: requiredEnv("MESSENGER_APP_SECRET"),
	verifyToken: requiredEnv("MESSENGER_VERIFY_TOKEN"),
	pageId: requiredEnv("MESSENGER_PAGE_ID"),

	// Mounted at GET/POST /channels/messenger/webhook.
	async webhook({ c, payload }) {
		const env = c.env as WebhookEnv;
		for (const entry of payload.entry) {
			for (const event of entry.messaging ?? []) {
				// Cart buttons (Захиалах postback + cart_* controls) are handled
				// deterministically ahead of the text path, so they never reach the
				// model: add/view/adjust/remove/confirm run with no LLM turn (and thus
				// run under local miniflare where `env.AI` is unavailable).
				if (await tryHandleCartEvent(event, env)) continue;
				// Post-order payment surface (#25): the QPay/transfer button taps, a
				// "Шилжүүлсэн" claim, and (within the transfer context) a "хийсэн"
				// text or a screenshot are handled deterministically here, ahead of
				// the photo/text paths, so a transfer claim never reaches the model
				// and never touches a payment-confirmation API.
				if (await tryHandlePaymentEvent(event, env)) continue;
				// Photo turns: trusted channel code fetches the Meta image, stages it
				// under messenger-inbound/ in R2, and dispatches ONLY the key (#20).
				if (await dispatchInboundImage(event, env)) continue;
				await dispatchInboundText(event, env);
			}
		}
		return undefined;
	},
});

// Admits a plain inbound text turn and dispatches it to the assistant. Pulled
// out of the webhook loop so each ingress concern (cart vs text) stays small.
async function dispatchInboundText(
	event: Parameters<typeof admitMessengerTextMessage>[0]["event"],
	env: WebhookEnv,
): Promise<void> {
	const admission = await admitMessengerTextMessage({ channel, event, env });
	if (admission === undefined) return;

	// dispatch() is the durable commit point. If it throws before the turn is
	// durably enqueued, release the dedupe claim and rethrow so Meta's retry can
	// re-deliver instead of being swallowed by dedupe.
	try {
		await dispatch(assistant, {
			id: admission.sessionId,
			input: {
				type: "messenger.message",
				messageId: admission.messageId,
				text: admission.text,
				attachmentTypes: admission.attachmentTypes,
				// dispatch() input must be JSON-clean: omit the key entirely when
				// there is no quick reply rather than passing undefined.
				...(admission.quickReplyPayload !== undefined
					? { quickReplyPayload: admission.quickReplyPayload }
					: {}),
			},
		});
	} catch (error) {
		await admission.release();
		throw error;
	}
}

// Admits an inbound photo turn: fetches each Meta CDN attachment server-side,
// stages it under the short-lived messenger-inbound/ R2 prefix, and dispatches
// the assistant turn carrying ONLY the R2 key(s) — never a CDN url or base64
// (ADR 0003, #20). Returns true when the event was an image message (consumed),
// false for non-image messages so the webhook falls through to the text path.
async function dispatchInboundImage(
	event: Parameters<typeof admitMessengerImageMessage>[0]["event"],
	env: WebhookEnv,
): Promise<boolean> {
	// Extract once and pass the array through to admission so the webhook loop
	// doesn't scan attachments twice per event.
	const images = extractInboundImages(event);
	if (images.length === 0) return false;

	// Resolve the bucket BEFORE claiming the mid: a missing binding is a
	// production misconfig that must fail loud (like the cart/admission stores),
	// leaving the mid unclaimed so Meta's retry is honored.
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error(
			"MESSENGER_INBOUND_BUCKET binding is required for inbound Messenger photos.",
		);
	}

	const admission = await admitMessengerImageMessage({
		channel,
		event,
		env,
		images,
	});
	if (admission === undefined) return true;

	try {
		const imageKeys: string[] = [];
		for (const image of admission.images) {
			const staged = await stageInboundImage(
				bucket,
				{
					sessionId: admission.sessionId,
					messageId: admission.messageId,
					index: image.index,
				},
				image.url,
			);
			if (staged !== undefined) imageKeys.push(staged.key);
		}

		// Nothing staged (expired/oversized url). Keep the claim so a Meta retry
		// of the same dead url doesn't re-apologize, and tell the customer.
		if (imageKeys.length === 0) {
			await sendTextReply(admission.conversation)(PHOTO_FETCH_FAILED_MESSAGE);
			return true;
		}

		await dispatch(assistant, {
			id: admission.sessionId,
			input: {
				type: "messenger.message",
				messageId: admission.messageId,
				text: admission.caption,
				// Derive from the STAGED keys, not every attempted attachment, so the
				// reported type count can't diverge from imageKeys.
				attachmentTypes: imageKeys.map(() => "image"),
				// The dispatch input carries R2 KEYS, never the Meta CDN url or any
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
// turns. Extracted from the webhook loop to keep that loop simple. Dedupe on the
// event mid (when present) makes a Meta retry idempotent for an add.
async function tryHandleCartEvent(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
): Promise<boolean> {
	const cartEvent = detectCartEvent(event);
	if (cartEvent === undefined) return false;

	const conversation = channel.conversationRef(event);
	if (conversation === undefined) return true;
	const sessionId = channel.conversationKey(conversation);

	// Resolve the cart store BEFORE claiming the mid: a missing binding is a
	// production misconfig that must fail loud (like the admission store does),
	// not silently swallow the customer's tap and burn the mid. Throwing here —
	// ahead of the claim — leaves the mid unclaimed so Meta's retry is honored.
	const cart = cartSessionFor(env.CART_STORE, sessionId);
	if (cart === undefined) {
		throw new Error(
			"CART_STORE binding is required for Messenger cart events.",
		);
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
		// Release the claim so Meta's retry can re-apply the dropped event.
		if (cartEvent.mid.length > 0) await releaseInboundClaim(claimKey, env);
		throw error;
	}
	return true;
}

// Public storefront origin the QPay-only page (#24) lives on. The store tRPC
// router and the storefront share one origin (storev2 mounts `/trpc/store`), so
// this defaults to the store API base; `STORE_PUBLIC_URL` overrides it when they
// diverge.
const storePublicUrl = (): string => {
	const base =
		process.env.STORE_PUBLIC_URL ??
		process.env.STORE_API_URL ??
		"http://localhost:3000";
	return base.replace(/\/+$/, "");
};

// Maps the channel-neutral payment-choice buttons to the Messenger SDK button
// shape (web_url needs `url`, postback needs `payload`).
const toMessengerButtons = (
	buttons: ReturnType<typeof buildPaymentChoice>["buttons"],
) =>
	buttons.map((b) =>
		b.type === "web_url"
			? { type: "web_url" as const, title: b.title, url: b.url as string }
			: {
					type: "postback" as const,
					title: b.title,
					payload: b.payload as string,
				},
	);

// Post-order payment choices (#25): a button template offering QPay (url button
// to the QPay-only page) and bank transfer (postback). Bound to one
// conversation; injected into the checkout tools' `place_order` so the offer is
// sent right after the order confirmation.
export function sendPaymentChoices(ref: MessengerConversationRef) {
	return async (order: CreatedOrder) => {
		if (!order.paymentNumber) return undefined;
		const choice = buildPaymentChoice(storePublicUrl(), {
			paymentNumber: order.paymentNumber,
			checkoutToken: order.checkoutToken,
		});
		const result = await messenger.templates.button({
			recipient: toRecipient(ref.participant),
			text: choice.text,
			buttons: toMessengerButtons(choice.buttons),
			messaging_type: "RESPONSE",
		});
		return { ok: true, messageId: result?.message_id ?? null };
	};
}

// Bank-transfer details (#25): the account/amount/reference text plus a single
// `Шилжүүлсэн` postback button the customer taps to lodge a transfer claim.
export function sendBankTransferDetails(ref: MessengerConversationRef) {
	return async (text: string, paymentRef: PaymentRef) => {
		const result = await messenger.templates.button({
			recipient: toRecipient(ref.participant),
			text,
			buttons: [
				{
					type: "postback" as const,
					title: TRANSFER_DONE_BUTTON_TITLE,
					payload: claimTransferPayload(paymentRef),
				},
			],
			messaging_type: "RESPONSE",
		});
		return { ok: true, messageId: result?.message_id ?? null };
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
			const summary = await fetchPaymentSummary(
				ref.paymentNumber,
				ref.checkoutToken,
			);
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
async function tryHandlePaymentEvent(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
): Promise<boolean> {
	if (event.message?.is_echo) return false;
	const conversation = channel.conversationRef(event);
	if (conversation === undefined) return false;
	const sessionId = channel.conversationKey(conversation);
	const checkout = checkoutSessionFor(env.CHECKOUT_STORE, sessionId);
	// Postbacks carry no message id; synthesize a stable dedup id from the
	// payload + timestamp so Meta's webhook retries don't re-run the transition.
	const rawMid = event.postback?.mid ?? event.message?.mid;
	const payPayload =
		event.postback?.payload ?? event.message?.quick_reply?.payload;
	const mid =
		rawMid && rawMid.length > 0
			? rawMid
			: payPayload
				? `syn:${event.timestamp ?? 0}:${payPayload}`
				: "";
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
	if (checkout === undefined) return false;
	const claim = await resolveContextualClaim(event, checkout);
	if (claim === undefined) return false;
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
	event: Parameters<typeof detectCartEvent>[0],
): { kind: "choose" | "claim"; ref: PaymentRef } | undefined {
	const payload =
		event.postback?.payload ?? event.message?.quick_reply?.payload;
	if (!payload) return undefined;
	const choose = parseChooseTransferPayload(payload);
	if (choose) return { kind: "choose", ref: choose };
	const claim = parseClaimTransferPayload(payload);
	if (claim) return { kind: "claim", ref: claim };
	return undefined;
}

// Resolves a contextual (non-button) transfer claim — a "хийсэн" text or a
// screenshot — against the persisted transfer context. A screenshot claims only
// on the bank-details screen (`transfer_pending`); a text claims from the moment
// the choices were offered. Returns undefined when this is not a claim.
async function resolveContextualClaim(
	event: Parameters<typeof detectCartEvent>[0],
	checkout: NonNullable<ReturnType<typeof checkoutSessionFor>>,
): Promise<{ ref: PaymentRef; alreadyClaimed: boolean } | undefined> {
	const isClaimText = isTransferDoneText(event.message?.text);
	const hasImage = extractInboundImages(event).length > 0;
	if (!isClaimText && !hasImage) return undefined;

	const payment = (await checkout.getCheckout())?.payment;
	if (!payment) return undefined;
	const inImageContext =
		hasImage && payment.transferStatus === "transfer_pending";
	// A "хийсэн" text is a claim at any post-order transfer status (offered /
	// pending / already-claimed).
	if (!inImageContext && !isClaimText) return undefined;

	return {
		ref: {
			paymentNumber: payment.paymentNumber,
			checkoutToken: payment.checkoutToken ?? null,
		},
		alreadyClaimed: payment.transferStatus === "transfer_claimed",
	};
}

// Runs a payment transition under the same mid-dedupe discipline as the cart
// path: claim the mid first (idempotent on a Meta retry), release it on failure
// so the retry is honored. Always returns true (the event is consumed).
async function runPaymentTransition(
	env: WebhookEnv,
	mid: string,
	sessionId: string,
	run: () => Promise<unknown>,
): Promise<boolean> {
	const claimKey = `messenger:payment:v1:${sessionId}:mid:${mid}`;
	if (mid.length > 0 && !(await claimInboundOnce(claimKey, env))) return true;
	try {
		await run();
	} catch (error) {
		if (mid.length > 0) await releaseInboundClaim(claimKey, env);
		throw error;
	}
	return true;
}

export function postMessage(ref: MessengerConversationRef) {
	const recipientId = ref.participant.id;
	return defineTool({
		name: "post_messenger_message",
		description:
			"Post a simple text reply to the bound Messenger customer conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			// Own the typing lifecycle here so typing_on and typing_off are always
			// paired: teardown is guaranteed in finally, and typing is never sent
			// from a path whose termination we cannot observe.
			await bestEffortTyping("on");
			try {
				const result = await messenger.send.message({
					recipient: toRecipient(ref.participant),
					messaging_type: "RESPONSE",
					message: { text: input.text },
				});
				return { ok: true, messageId: result?.message_id ?? null };
			} finally {
				await bestEffortTyping("off");
			}
		},
	});

	async function bestEffortTyping(action: "on" | "off"): Promise<void> {
		try {
			if (action === "on") await messenger.send.typingOn(recipientId);
			else await messenger.send.typingOff(recipientId);
		} catch {
			// Typing indicators are cosmetic; never fail a reply over one.
		}
	}
}

// Plain text sender bound to a conversation. Used by the product-search tool's
// no-match path; mirrors the send shape of post_messenger_message.
export function sendTextReply(ref: MessengerConversationRef) {
	return async (text: string) => {
		const result = await messenger.send.message({
			recipient: toRecipient(ref.participant),
			messaging_type: "RESPONSE",
			message: { text },
		});
		return { ok: true, messageId: result?.message_id ?? null };
	};
}

// Sends the cart summary as a text message carrying the cart-control quick
// replies (✅ confirm / 🗑 clear and per-item ➕ ➖ ✖). Tapping a quick reply
// delivers its payload back on the webhook, where `detectCartEvent` routes it
// straight to the cart reducer — no model turn. Bound to one conversation.
export function sendCartSummary(ref: MessengerConversationRef) {
	return async (cart: Cart) => {
		const quickReplies = cartQuickReplies(cart).map((qr) => ({
			content_type: "text" as const,
			title: qr.title,
			payload: qr.payload,
		}));
		const result = await messenger.send.message({
			recipient: toRecipient(ref.participant),
			messaging_type: "RESPONSE",
			message: {
				text: formatCartSummary(cart),
				...(quickReplies.length > 0 ? { quick_replies: quickReplies } : {}),
			},
		});
		return { ok: true, messageId: result?.message_id ?? null };
	};
}

// Resolves a single product id to the shared assistant projection for cart
// lines. Reuses the by-id catalog boundary (no duplicated catalog logic).
export async function resolveProductById(
	id: number,
): Promise<AssistantProduct | undefined> {
	const [product] = await getAssistantProductsByIds([id]);
	return product;
}

// Sends channel-neutral product cards as a Messenger generic template. Each
// element carries the product's Захиалах postback button whose payload holds
// the product id. Generic templates allow at most 10 elements.
export function sendProductCards(ref: MessengerConversationRef) {
	return async (cards: ProductCard[]) => {
		const elements = cards.slice(0, 10).map((card) => ({
			title: card.title,
			subtitle: card.subtitle,
			...(card.imageUrl ? { image_url: card.imageUrl } : {}),
			buttons: [
				{
					type: "postback" as const,
					title: card.button.label,
					payload: card.button.payload,
				},
			],
		}));

		console.log(
			`[bot.cards] ${elements.map((e) => e.title).join(" | ").slice(0, 700)}`,
		);
		try {
			const result = await messenger.templates.generic({
				recipient: toRecipient(ref.participant),
				elements,
				messaging_type: "RESPONSE",
			});
			return {
				ok: true,
				messageId: result?.message_id ?? null,
				cardCount: elements.length,
			};
		} catch (error) {
			// Cards are best-effort: the catalog search already succeeded, so a
			// transient Graph send failure (or a non-deliverable test PSID during
			// dogfooding) must NOT throw out of the tool and make the model apologise
			// that the search itself failed. Log and report the cards as produced.
			console.warn(
				`[bot.cards] send failed (best-effort): ${error instanceof Error ? error.message : String(error)}`,
			);
			return { ok: true, messageId: null, cardCount: elements.length };
		}
	};
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
