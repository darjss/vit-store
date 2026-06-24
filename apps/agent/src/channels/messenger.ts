import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
	type MessengerParticipantRef,
} from "@flue/messenger";
import { defineTool, dispatch } from "@flue/runtime";
import {
	type AssistantProduct,
	type Cart,
	cartQuickReplies,
	formatCartSummary,
	type ProductCard,
} from "@vit/assistant";
import { Messenger, type Recipient } from "@warriorteam/messenger-sdk";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import { getAssistantProductsByIds } from "../lib/catalog";
import { detectCartEvent, handleCartEvent } from "./cart-handler";
import { cartSessionFor } from "./cart-session";
import {
	admitMessengerImageMessage,
	admitMessengerTextMessage,
	claimInboundOnce,
	extractInboundImages,
	releaseInboundClaim,
} from "./messenger-admission";
import { stageInboundImage } from "../lib/messenger-inbound";

// Worker bindings the Messenger webhook reaches through the Hono context.
type WebhookEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	CART_STORE?: DurableObjectNamespace;
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
	// Local dev seam: when set, outbound Graph Send API calls are redirected to
	// a capture endpoint (see apps/agent/cli/messenger-dev.ts) so the real send
	// path runs without touching Meta. Unset in production -> real Graph host.
	...(process.env.MESSENGER_GRAPH_BASE_URL
		? { baseUrl: process.env.MESSENGER_GRAPH_BASE_URL }
		: {}),
});

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
	if (extractInboundImages(event).length === 0) return false;

	// Resolve the bucket BEFORE claiming the mid: a missing binding is a
	// production misconfig that must fail loud (like the cart/admission stores),
	// leaving the mid unclaimed so Meta's retry is honored.
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error(
			"MESSENGER_INBOUND_BUCKET binding is required for inbound Messenger photos.",
		);
	}

	const admission = await admitMessengerImageMessage({ channel, event, env });
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
				attachmentTypes: admission.images.map(() => "image"),
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
				return { messageId: result.message_id };
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
		return { messageId: result.message_id };
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
		return { messageId: result.message_id };
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

		const result = await messenger.templates.generic({
			recipient: toRecipient(ref.participant),
			elements,
			messaging_type: "RESPONSE",
		});
		return { messageId: result.message_id, cardCount: elements.length };
	};
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
