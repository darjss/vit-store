import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
	type MessengerParticipantRef,
} from "@flue/messenger";
import { defineTool, dispatch, type AgentDefinition } from "@flue/runtime";
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
import { minLength, object, optional, pipe, safeParse, string } from "valibot";
import assistant from "../agents/customer-assistant";
import adminAssistant from "../agents/admin-assistant";
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
	ADMIN_BOT_TOKEN?: string;
	// Admin agent gate: comma-separated admin PSIDs + the bot token for the
	// tRPC bot client. LOADER is the Codemode sandbox binding (used inside the
	// admin agent, not the webhook, but typed here for completeness).
	ADMIN_PSIDS?: string;
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
	LOADER?: WorkerLoader;
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

// Mongolian apology when an inbound photo can't be fetched from Meta (expired
// CDN url / oversized). Keeps the customer in the conversation instead of
// silently dropping their picture.
const PHOTO_FETCH_FAILED_MESSAGE =
	"Уучлаарай, таны илгээсэн зургийг боловсруулж чадсангүй. Барааны нэрийг бичих эсвэл зургаа дахин илгээнэ үү.";

const graphVersion = "v25.0";

const messengerOptions = {
	accessToken: requiredEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
	maxRetries: 0,
	version: graphVersion,
};
const graphBaseUrl = process.env.MESSENGER_GRAPH_BASE_URL;
if (graphBaseUrl) {
	messengerOptions.baseUrl = graphBaseUrl;
}

export const messenger = new Messenger(messengerOptions);

// Outbound capture at the single SDK choke point: log every text the bot sends.
// This is prod observability of what the bot actually says, and it lets a CLI
// dogfood read the bot's replies from `wrangler tail` / Workers Logs WITHOUT the
// message being delivered (drive the webhook with a non-deliverable test PSID).
const outboundMessageBodySchema = object({
	message: optional(object({ text: optional(string()) })),
});

const _sendMessage = messenger.send.message.bind(messenger.send);
messenger.send.message = async (body, opts) => {
	const parsed = safeParse(outboundMessageBodySchema, body);
	const text = parsed.success ? parsed.output.message?.text : undefined;
	if (text && text.length > 0) {
		console.log(`[bot.say] ${text.replaceAll("\n", " ⏎ ").slice(0, 700)}`);
	}
	return _sendMessage(body, opts);
};

export function toRecipient(ref: MessengerParticipantRef): Recipient {
	return ref.type === "page-scoped-id" ? { id: ref.id } : { user_ref: ref.id };
}

// Session version suffix for the admin agent. The v1 session accumulated
// 79k+ chars of tool results that overwhelmed the model. This suffix routes
// admin messages to a fresh DO instance (:v2) while the admin agent strips
// it before parsing the conversation key for postMessage. Bump to :v3 etc.
// if the session ever needs rotating again.
const ADMIN_SESSION_SUFFIX = ":v2";

export const channel: MessengerChannel = createMessengerChannel({
	appSecret: requiredEnv("MESSENGER_APP_SECRET"),
	pageId: requiredEnv("MESSENGER_PAGE_ID"),
	verifyToken: requiredEnv("MESSENGER_VERIFY_TOKEN"),

	// Mounted at GET/POST /channels/messenger/webhook.
	async webhook({ c, payload }) {
		const env = c.env;
		for (const entry of payload.entry) {
			for (const event of entry.messaging ?? []) {
				// Admin PSID gate: an authorized admin's messages route to the
				// admin agent (Codemode query tool) BEFORE any customer-path
				// logic. Non-admin PSIDs fall through to the customer agent
				// unchanged. Reuses the same image/text dispatch helpers with
				// `adminAssistant` as the target — no duplicated logic.
				const adminConversation = channel.conversationRef(event);
				if (adminConversation && isAdminPsid(adminConversation.participant.id, env)) {
					if (await dispatchInboundImage(event, env, adminAssistant, ADMIN_SESSION_SUFFIX)) {
						continue;
					}
					await dispatchInboundText(event, env, adminAssistant, ADMIN_SESSION_SUFFIX);
					continue;
				}
				// Cart buttons (Захиалах postback + cart_* controls) are handled
				// deterministically ahead of the text path, so they never reach the
				// model: add/view/adjust/remove/confirm run with no LLM turn (and thus
				// run under local miniflare where `env.AI` is unavailable).
				if (await tryHandleCartEvent(event, env)) {
					continue;
				}
				// Post-order payment surface (#25): the QPay/transfer button taps, a
				// "Шилжүүлсэн" claim, and (within the transfer context) a "хийсэн"
				// text or a screenshot are handled deterministically here, ahead of
				// the photo/text paths, so a transfer claim never reaches the model
				// and never touches a payment-confirmation API.
				if (await tryHandlePaymentEvent(event, env)) {
					continue;
				}
				// Photo turns: trusted channel code fetches the Meta image, stages it
				// under messenger-inbound/ in R2, and dispatches ONLY the key (#20).
				if (await dispatchInboundImage(event, env)) {
					continue;
				}
				await dispatchInboundText(event, env);
			}
		}
		return undefined;
	},
});

// Admin PSID allowlist: env.ADMIN_PSIDS is a comma-separated list of authorized
// admin PSIDs. Returns true when the sender is an admin (routes to the admin
// agent), false otherwise (falls through to the customer agent).
function isAdminPsid(psid: string, env: WebhookEnv): boolean {
	const raw = env.ADMIN_PSIDS;
	if (!raw) {
		return false;
	}
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.includes(psid);
}

// Admits a plain inbound text turn and dispatches it to the target agent.
// `target` defaults to the customer assistant; the admin gate passes
// `adminAssistant` to route admin PSIDs to the admin agent without duplicating
// the admission/dispatch logic.
// `sessionIdSuffix` appends a version tag to the dispatch id, creating a fresh
// DO instance (and thus a fresh session) without affecting the conversation key
// parsing in the agent. Used to rotate the admin session after context bloat.
async function dispatchInboundText(
	event: Parameters<typeof admitMessengerTextMessage>[0]["event"],
	env: WebhookEnv,
	target: AgentDefinition = assistant,
	sessionIdSuffix = "",
): Promise<void> {
	const admission = await admitMessengerTextMessage({ channel, env, event });
	if (admission === undefined) {
		return;
	}

	// dispatch() is the durable commit point. If it throws before the turn is
	// durably enqueued, release the dedupe claim and rethrow so Meta's retry can
	// re-deliver instead of being swallowed by dedupe.
	try {
		const dispatchInput = {
			attachmentTypes: admission.attachmentTypes,
			messageId: admission.messageId,
			text: admission.text,
			type: "messenger.message" as const,
		};
		if (admission.quickReplyPayload !== undefined) {
			dispatchInput.quickReplyPayload = admission.quickReplyPayload;
		}
		await dispatch(target, {
			id: admission.sessionId + sessionIdSuffix,
			input: dispatchInput,
		});
	} catch (error) {
		await admission.release();
		throw error;
	}
}

// Admits an inbound photo turn: fetches each Meta CDN attachment server-side,
// stages it under the short-lived messenger-inbound/ R2 prefix, and dispatches
// the target agent turn carrying ONLY the R2 key(s) — never a CDN url or base64
// (ADR 0003, #20). Returns true when the event was an image message (consumed),
// false for non-image messages so the webhook falls through to the text path.
// `target` defaults to the customer assistant; the admin gate passes
// `adminAssistant`.
async function dispatchInboundImage(
	event: Parameters<typeof admitMessengerImageMessage>[0]["event"],
	env: WebhookEnv,
	target: AgentDefinition = assistant,
	sessionIdSuffix = "",
): Promise<boolean> {
	// Extract once and pass the array through to admission so the webhook loop
	// doesn't scan attachments twice per event.
	const images = extractInboundImages(event);
	if (images.length === 0) {
		return false;
	}

	// Resolve the bucket BEFORE claiming the mid: a missing binding is a
	// production misconfig that must fail loud (like the cart/admission stores),
	// leaving the mid unclaimed so Meta's retry is honored.
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error("MESSENGER_INBOUND_BUCKET binding is required for inbound Messenger photos.");
	}

	const admission = await admitMessengerImageMessage({
		channel,
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

		// Nothing staged (expired/oversized url). Keep the claim so a Meta retry
		// of the same dead url doesn't re-apologize, and tell the customer.
		if (imageKeys.length === 0) {
			await sendTextReply(admission.conversation)(PHOTO_FETCH_FAILED_MESSAGE);
			return true;
		}

		await dispatch(target, {
			id: admission.sessionId + sessionIdSuffix,
			input: {
				messageId: admission.messageId,
				text: admission.caption,
				type: "messenger.message",
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
	if (cartEvent === undefined) {
		return false;
	}

	const conversation = channel.conversationRef(event);
	if (conversation === undefined) {
		return true;
	}
	const sessionId = channel.conversationKey(conversation);

	// Resolve the cart store BEFORE claiming the mid: a missing binding is a
	// production misconfig that must fail loud (like the admission store does),
	// not silently swallow the customer's tap and burn the mid. Throwing here —
	// ahead of the claim — leaves the mid unclaimed so Meta's retry is honored.
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
		// Release the claim so Meta's retry can re-apply the dropped event.
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

// Maps the channel-neutral payment-choice buttons to the Messenger SDK button
// shape (web_url needs `url`, postback needs `payload`).
const toMessengerButtons = (buttons: ReturnType<typeof buildPaymentChoice>["buttons"]) =>
	buttons.map((b) => {
		if (b.type === "web_url") {
			return { title: b.title, type: "web_url" as const, url: b.url };
		}
		return {
			payload: b.payload,
			title: b.title,
			type: "postback" as const,
		};
	});

// Post-order payment choices (#25): a button template offering QPay (url button
// to the QPay-only page) and bank transfer (postback). Bound to one
// conversation; injected into the checkout tools' `place_order` so the offer is
// sent right after the order confirmation.
export function sendPaymentChoices(ref: MessengerConversationRef) {
	return async (order: CreatedOrder) => {
		if (!order.paymentNumber) {
			return undefined;
		}
		const choice = buildPaymentChoice(storePublicUrl(), {
			checkoutToken: order.checkoutToken,
			paymentNumber: order.paymentNumber,
		});
		const result = await messenger.templates.button({
			buttons: toMessengerButtons(choice.buttons),
			messaging_type: "RESPONSE",
			recipient: toRecipient(ref.participant),
			text: choice.text,
		});
		return { messageId: result?.message_id ?? null, ok: true };
	};
}

// Bank-transfer details (#25): the account/amount/reference text plus a single
// `Шилжүүлсэн` postback button the customer taps to lodge a transfer claim.
export function sendBankTransferDetails(ref: MessengerConversationRef) {
	return async (text: string, paymentRef: PaymentRef) => {
		const result = await messenger.templates.button({
			buttons: [
				{
					payload: claimTransferPayload(paymentRef),
					title: TRANSFER_DONE_BUTTON_TITLE,
					type: "postback" as const,
				},
			],
			messaging_type: "RESPONSE",
			recipient: toRecipient(ref.participant),
			text,
		});
		return { messageId: result?.message_id ?? null, ok: true };
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
async function tryHandlePaymentPostback(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
	sessionId: string,
	mid: string,
): Promise<boolean> {
	const postback = detectPaymentPostback(event);
	if (!postback) {
		return false;
	}
	const conversation = channel.conversationRef(event);
	if (conversation === undefined) {
		return false;
	}
	const checkout = checkoutSessionFor(env.CHECKOUT_STORE, sessionId);
	const run =
		postback.kind === "choose"
			? () => handleChooseTransfer(postback.ref, paymentDepsFor(conversation, checkout))
			: () => handleTransferClaim(postback.ref, paymentDepsFor(conversation, checkout));
	return runPaymentTransition(env, mid, sessionId, run);
}

async function tryHandleContextualPaymentClaim(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
	sessionId: string,
	mid: string,
): Promise<boolean> {
	const checkout = checkoutSessionFor(env.CHECKOUT_STORE, sessionId);
	if (checkout === undefined) {
		return false;
	}
	const claim = await resolveContextualClaim(event, checkout);
	if (claim === undefined) {
		return false;
	}
	const conversation = channel.conversationRef(event);
	if (conversation === undefined) {
		return false;
	}
	const d = paymentDepsFor(conversation, checkout);
	const run = claim.alreadyClaimed
		? () => d.sendText(TRANSFER_CLAIM_ACK_MESSAGE).then(() => undefined)
		: () => handleTransferClaim(claim.ref, d);
	return runPaymentTransition(env, mid, sessionId, run);
}

function paymentEventMid(event: Parameters<typeof detectCartEvent>[0]): string {
	const rawMid = event.postback?.mid ?? event.message?.mid;
	const payPayload = event.postback?.payload ?? event.message?.quick_reply?.payload;
	if (rawMid && rawMid.length > 0) {
		return rawMid;
	}
	return payPayload ? `syn:${event.timestamp ?? 0}:${payPayload}` : "";
}

async function tryHandlePaymentEvent(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
): Promise<boolean> {
	if (event.message?.is_echo) {
		return false;
	}
	const conversation = channel.conversationRef(event);
	if (conversation === undefined) {
		return false;
	}
	const sessionId = channel.conversationKey(conversation);
	const mid = paymentEventMid(event);

	if (await tryHandlePaymentPostback(event, env, sessionId, mid)) {
		return true;
	}
	return tryHandleContextualPaymentClaim(event, env, sessionId, mid);
}

// Decodes a payment button tap from a postback/quick-reply payload into the
// transition kind + its payment ref, or undefined when it is not one.
function detectPaymentPostback(
	event: Parameters<typeof detectCartEvent>[0],
): { kind: "choose" | "claim"; ref: PaymentRef } | undefined {
	const payload = event.postback?.payload ?? event.message?.quick_reply?.payload;
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
	event: Parameters<typeof detectCartEvent>[0],
	checkout: NonNullable<ReturnType<typeof checkoutSessionFor>>,
): Promise<{ alreadyClaimed: boolean; ref: PaymentRef } | undefined> {
	const isClaimText = isTransferDoneText(event.message?.text);
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

// Runs a payment transition under the same mid-dedupe discipline as the cart
// path: claim the mid first (idempotent on a Meta retry), release it on failure
// so the retry is honored. Always returns true (the event is consumed).
async function runPaymentTransition(
	env: WebhookEnv,
	mid: string,
	sessionId: string,
	run: () => Promise<void>,
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
	const recipientId = ref.participant.id;
	return defineTool({
		description: "Post a simple text reply to the bound Messenger customer conversation.",
		input: object({ text: pipe(string(), minLength(1)) }),
		name: "post_messenger_message",
		async run({ input }) {
			// Own the typing lifecycle here so typing_on and typing_off are always
			// paired: teardown is guaranteed in finally, and typing is never sent
			// from a path whose termination we cannot observe.
			await bestEffortTyping("on");
			try {
				const result = await messenger.send.message({
					message: { text: input.text },
					messaging_type: "RESPONSE",
					recipient: toRecipient(ref.participant),
				});
				return { messageId: result?.message_id ?? null, ok: true };
			} finally {
				await bestEffortTyping("off");
			}
		},
	});

	async function bestEffortTyping(action: "on" | "off"): Promise<void> {
		try {
			if (action === "on") {
				await messenger.send.typingOn(recipientId);
			} else {
				await messenger.send.typingOff(recipientId);
			}
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
			message: { text },
			messaging_type: "RESPONSE",
			recipient: toRecipient(ref.participant),
		});
		return { messageId: result?.message_id ?? null, ok: true };
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
			payload: qr.payload,
			title: qr.title,
		}));
		const message = {
			text: formatCartSummary(cart),
		};
		if (quickReplies.length > 0) {
			message.quick_replies = quickReplies;
		}
		const result = await messenger.send.message({
			message,
			messaging_type: "RESPONSE",
			recipient: toRecipient(ref.participant),
		});
		return { messageId: result?.message_id ?? null, ok: true };
	};
}

// Resolves a single product id to the shared assistant projection for cart
// lines. Reuses the by-id catalog boundary (no duplicated catalog logic).
export async function resolveProductById(id: number): Promise<AssistantProduct | undefined> {
	const [product] = await getAssistantProductsByIds([id]);
	return product;
}

// Sends channel-neutral product cards as a Messenger generic template. Each
// element carries the product's Захиалах postback button whose payload holds
// the product id. Generic templates allow at most 10 elements.
export function sendProductCards(ref: MessengerConversationRef) {
	return async (cards: Array<ProductCard>) => {
		const elements = cards.slice(0, 10).map((card) => {
			const element = {
				buttons: [
					{
						payload: card.button.payload,
						title: card.button.label,
						type: "postback" as const,
					},
				],
				subtitle: card.subtitle,
				title: card.title,
			};
			if (card.imageUrl) {
				element.image_url = card.imageUrl;
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
			const result = await messenger.templates.generic({
				elements,
				messaging_type: "RESPONSE",
				recipient: toRecipient(ref.participant),
			});
			return {
				cardCount: elements.length,
				messageId: result?.message_id ?? null,
				ok: true,
			};
		} catch (error) {
			// Cards are best-effort: the catalog search already succeeded, so a
			// transient Graph send failure (or a non-deliverable test PSID during
			// dogfooding) must NOT throw out of the tool and make the model apologise
			// that the search itself failed. Log and report the cards as produced.
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
