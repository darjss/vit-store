import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
	type MessengerParticipantRef,
} from "@flue/messenger";
import { defineTool, dispatch, type AgentDefinition } from "@flue/runtime";
import {
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
import {
	type DeliveryFailure,
	deliveryFailureSchema,
	invalidDelivery,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { match } from "dismatch";
import { matchAsync } from "dismatch/async";
import { Messenger, type Recipient } from "@warriorteam/messenger-sdk";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import adminAssistant from "../agents/admin-assistant";
import { getAssistantProductsByIds } from "../lib/catalog";
import {
	classifyMessengerDeliveryFailure,
	sendMessenger,
} from "../lib/messenger-delivery";
import { stageInboundImage } from "../lib/messenger-inbound";
import {
	claimTransfer,
	fetchPaymentSummary,
	type PaymentOperationFailure,
} from "../lib/payment";
import {
	CartPostcommitError,
	detectCartEvent,
	handleCartEvent,
} from "./cart-handler";
import { cartSessionFor } from "./cart-session";
import { checkoutSessionFor } from "./checkout-session";
import {
	admitMessengerImageMessage,
	admitMessengerTextMessage,
	claimInboundOnce,
	extractInboundImages,
	type MessengerAdmissionFailure,
	type MessengerAdmissionReleaseFailure,
	releaseInboundClaim,
} from "./messenger-admission";
import {
	handleChooseTransfer,
	handleTransferClaim,
	PaymentPostcommitError,
	type PaymentHandlerDeps,
} from "./payment-handler";

// Worker bindings the Messenger webhook reaches through the Hono context.
type WebhookEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
	// Admin agent gate: comma-separated admin PSIDs + the bot token for the
	// tRPC bot client. LOADER is the Codemode sandbox binding (used inside the
	// admin agent, not the webhook, but typed here for completeness).
	ADMIN_PSIDS?: string;
	ADMIN_BOT_TOKEN?: string;
	LOADER?: WorkerLoader;
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

export function toRecipient(ref: MessengerParticipantRef): Recipient {
	return ref.type === "page-scoped-id" ? { id: ref.id } : { user_ref: ref.id };
}

// Session version suffix for the admin agent. The v1 session accumulated
// 79k+ chars of tool results that overwhelmed the model. This suffix routes
// admin messages to a fresh DO instance (:v2) while the admin agent strips
// it before parsing the conversation key for postMessage. Bump to :v3 etc.
// if the session ever needs rotating again.
const ADMIN_SESSION_SUFFIX = ":v2";

type WebhookOutcome =
	| { _tag: "Acknowledged" }
	| { _tag: "Retry"; response: Response };

const acknowledged = { _tag: "Acknowledged" } as const;

const admissionOutcome = (error: MessengerAdmissionFailure) =>
	match(
		error,
		"_tag",
	)<WebhookOutcome>({
		DuplicateInboundDelivery: () => acknowledged,
		InvalidDelivery: () => acknowledged,
		RetryableDeliveryFailure: () => ({
			_tag: "Retry",
			response: Response.json(
				{ error: "temporarily_unavailable" },
				{ status: 503 },
			),
		}),
	});

const logDeliveryFailure = async (
	delivery: Promise<BetterResult<unknown, DeliveryFailure>>,
	operation: string,
) => {
	const result = await delivery;
	if (result.status === "error") {
		console.warn("[messenger] delivery failed", {
			operation,
			error_tag: result.error._tag,
			provider: result.error.provider,
			code: result.error.code,
		});
	}
};

const logReleaseFailure = async (
	release: Promise<BetterResult<void, MessengerAdmissionReleaseFailure>>,
) => {
	const result = await release;
	if (result.status === "error") {
		console.warn("[messenger] claim release failed", {
			error_tag: result.error._tag,
			provider: result.error.provider,
			code: result.error.code,
		});
	}
};

export const channel: MessengerChannel = createMessengerChannel({
	appSecret: requiredEnv("MESSENGER_APP_SECRET"),
	verifyToken: requiredEnv("MESSENGER_VERIFY_TOKEN"),
	pageId: requiredEnv("MESSENGER_PAGE_ID"),

	// Mounted at GET/POST /channels/messenger/webhook. Flue owns exact-byte
	// signature verification, Page validation, and provider-native parsing.
	async webhook({ c, payload }) {
		const env = c.env as WebhookEnv;
		for (const entry of payload.entry) {
			for (const event of entry.messaging ?? []) {
				const outcome = await handleVerifiedMessengerEvent(event, env);
				if (outcome._tag === "Retry") return outcome.response;
			}
		}
		return undefined;
	},
});

type MessengerEvent = Parameters<typeof admitMessengerTextMessage>[0]["event"];

const consumedStepOutcome = (
	result: BetterResult<boolean, MessengerAdmissionFailure>,
) => {
	if (result.status === "error") return admissionOutcome(result.error);
	return result.value ? acknowledged : undefined;
};

async function handleAdminMessengerEvent(
	event: MessengerEvent,
	env: WebhookEnv,
): Promise<WebhookOutcome> {
	const image = await dispatchInboundImage(
		event,
		env,
		adminAssistant,
		ADMIN_SESSION_SUFFIX,
	);
	const imageOutcome = consumedStepOutcome(image);
	if (imageOutcome) return imageOutcome;

	const text = await dispatchInboundText(
		event,
		env,
		adminAssistant,
		ADMIN_SESSION_SUFFIX,
	);
	return text.status === "error" ? admissionOutcome(text.error) : acknowledged;
}

async function handleCustomerMessengerEvent(
	event: MessengerEvent,
	env: WebhookEnv,
): Promise<WebhookOutcome> {
	const cartOutcome = consumedStepOutcome(await tryHandleCartEvent(event, env));
	if (cartOutcome) return cartOutcome;

	const paymentOutcome = consumedStepOutcome(
		await tryHandlePaymentEvent(event, env),
	);
	if (paymentOutcome) return paymentOutcome;

	const imageOutcome = consumedStepOutcome(
		await dispatchInboundImage(event, env),
	);
	if (imageOutcome) return imageOutcome;

	const text = await dispatchInboundText(event, env);
	return text.status === "error" ? admissionOutcome(text.error) : acknowledged;
}

async function handleVerifiedMessengerEvent(
	event: MessengerEvent,
	env: WebhookEnv,
): Promise<WebhookOutcome> {
	const conversation = channel.conversationRef(event);
	return conversation && isAdminPsid(conversation.participant.id, env)
		? handleAdminMessengerEvent(event, env)
		: handleCustomerMessengerEvent(event, env);
}

// Admin PSID allowlist: env.ADMIN_PSIDS is a comma-separated list of authorized
// admin PSIDs. Returns true when the sender is an admin (routes to the admin
// agent), false otherwise (falls through to the customer agent).
function isAdminPsid(psid: string, env: WebhookEnv): boolean {
	const raw = env.ADMIN_PSIDS;
	if (!raw) return false;
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
): Promise<BetterResult<void, MessengerAdmissionFailure>> {
	const admitted = await admitMessengerTextMessage({ channel, event, env });
	if (admitted.status === "error") {
		return Result.err<void, MessengerAdmissionFailure>(admitted.error);
	}
	const admission = admitted.value;
	if (admission === undefined) return Result.ok(undefined);

	// dispatch() is the durable commit point. Release a precommit claim before
	// the unknown defect is rethrown so Meta can deliver the event again.
	try {
		await dispatch(target, {
			id: admission.sessionId + sessionIdSuffix,
			input: {
				type: "messenger.message",
				messageId: admission.messageId,
				text: admission.text,
				attachmentTypes: admission.attachmentTypes,
				...(admission.quickReplyPayload !== undefined
					? { quickReplyPayload: admission.quickReplyPayload }
					: {}),
			},
		});
	} catch (error) {
		await logReleaseFailure(admission.release());
		throw error;
	}
	return Result.ok(undefined);
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
): Promise<BetterResult<boolean, MessengerAdmissionFailure>> {
	const images = extractInboundImages(event);
	if (images.length === 0) return Result.ok(false);

	// Resolve the bucket before admission. A missing production binding is a
	// defect, and the message ID must remain unclaimed.
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error(
			"MESSENGER_INBOUND_BUCKET binding is required for inbound Messenger photos.",
		);
	}

	const admitted = await admitMessengerImageMessage({
		channel,
		event,
		env,
		images,
	});
	if (admitted.status === "error") {
		return Result.err<boolean, MessengerAdmissionFailure>(admitted.error);
	}
	const admission = admitted.value;
	if (admission === undefined) return Result.ok(true);

	try {
		const imageKeys: string[] = [];
		let hasRetryableFailure = false;
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
			if (staged.status === "ok") {
				imageKeys.push(staged.value.key);
				continue;
			}
			hasRetryableFailure ||= match(
				staged.error,
				"_tag",
			)({
				InvalidSource: () => false,
				NoUsableImages: () => false,
				ExtractionFailed: ({ retryable }) => retryable,
				ProviderUnavailable: ({ retryable }) => retryable,
			});
		}

		if (imageKeys.length === 0 && hasRetryableFailure) {
			await logReleaseFailure(admission.release());
			return Result.err(
				retryableDeliveryFailure("messenger", "provider_unavailable"),
			);
		}

		// Permanent per-image failures are acknowledged. This prevents a dead CDN
		// URL from causing repeated apologies. Expected send failures are
		// postclaim best effort.
		if (imageKeys.length === 0) {
			await logDeliveryFailure(
				sendTextReply(admission.conversation)(PHOTO_FETCH_FAILED_MESSAGE),
				"photo.apology",
			);
			return Result.ok(true);
		}

		await dispatch(target, {
			id: admission.sessionId + sessionIdSuffix,
			input: {
				type: "messenger.message",
				messageId: admission.messageId,
				text: admission.caption,
				attachmentTypes: imageKeys.map(() => "image"),
				imageKeys,
			},
		});
	} catch (error) {
		await logReleaseFailure(admission.release());
		throw error;
	}
	return Result.ok(true);
}

// Handles a Messenger event if it is a cart button/quick-reply, returning true
// when consumed (so the webhook skips the text path). Returns false for plain
// turns. Extracted from the webhook loop to keep that loop simple. Dedupe on the
// event mid (when present) makes a Meta retry idempotent for an add.
async function tryHandleCartEvent(
	event: Parameters<typeof detectCartEvent>[0],
	env: WebhookEnv,
): Promise<BetterResult<boolean, MessengerAdmissionFailure>> {
	const cartEvent = detectCartEvent(event);
	if (cartEvent === undefined) return Result.ok(false);

	const conversation = channel.conversationRef(event);
	if (conversation === undefined) {
		return Result.err(invalidDelivery("messenger", "invalid_payload"));
	}
	const sessionId = channel.conversationKey(conversation);

	const cart = cartSessionFor(env.CART_STORE, sessionId);
	if (cart === undefined) {
		throw new Error(
			"CART_STORE binding is required for Messenger cart events.",
		);
	}

	const claimKey = `messenger:cart:v1:${sessionId}:mid:${cartEvent.mid}`;
	if (cartEvent.mid.length > 0) {
		const claimed = await claimInboundOnce(claimKey, env);
		if (claimed.status === "error") {
			return Result.err<boolean, MessengerAdmissionFailure>(claimed.error);
		}
	}

	try {
		const handled = await handleCartEvent(cartEvent, {
			cart,
			resolveProduct: resolveProductById,
			sendCartSummary: sendCartSummary(conversation),
			sendText: sendTextReply(conversation),
		});
		if (handled.status === "error") {
			if (cartEvent.mid.length > 0) {
				await logReleaseFailure(releaseInboundClaim(claimKey, env));
			}
			return Result.err(
				retryableDeliveryFailure("messenger", "provider_unavailable"),
			);
		}
	} catch (error) {
		if (!(error instanceof CartPostcommitError) && cartEvent.mid.length > 0) {
			await logReleaseFailure(releaseInboundClaim(claimKey, env));
		}
		throw error;
	}
	return Result.ok(true);
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
	buttons.map((button) =>
		button.type === "web_url"
			? { type: "web_url" as const, title: button.title, url: button.url }
			: {
					type: "postback" as const,
					title: button.title,
					payload: button.payload,
				},
	);

// Post-order payment choices (#25): a button template offering QPay (url button
// to the QPay-only page) and bank transfer (postback). Bound to one
// conversation; injected into the checkout tools' `place_order` so the offer is
// sent right after the order confirmation.
export function sendPaymentChoices(ref: MessengerConversationRef) {
	return async (order: CreatedOrder) => {
		if (!order.paymentNumber) {
			return Result.ok<undefined, DeliveryFailure>(undefined);
		}
		const choice = buildPaymentChoice(storePublicUrl(), {
			paymentNumber: order.paymentNumber,
			checkoutToken: order.checkoutToken,
		});
		return sendMessenger(() =>
			messenger.templates.button({
				recipient: toRecipient(ref.participant),
				text: choice.text,
				buttons: toMessengerButtons(choice.buttons),
				messaging_type: "RESPONSE",
			}),
		);
	};
}

// Bank-transfer details (#25): the account/amount/reference text plus a single
// `Шилжүүлсэн` postback button the customer taps to lodge a transfer claim.
export function sendBankTransferDetails(ref: MessengerConversationRef) {
	return async (text: string, paymentRef: PaymentRef) =>
		sendMessenger(() =>
			messenger.templates.button({
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
			}),
		);
}

// Binds the post-order payment handler dependencies to one conversation: the
// store-API boundary (summary + claim), the two channel senders, and best-effort
// transfer-status persistence on the per-session checkout record.
function paymentDepsFor(
	conversation: MessengerConversationRef,
	checkout: ReturnType<typeof checkoutSessionFor>,
): PaymentHandlerDeps {
	return {
		fetchPaymentSummary: (ref) =>
			fetchPaymentSummary(ref.paymentNumber, ref.checkoutToken),
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
): Promise<BetterResult<boolean, MessengerAdmissionFailure>> {
	if (event.message?.is_echo) return Result.ok(false);
	const conversation = channel.conversationRef(event);
	if (conversation === undefined) return Result.ok(false);
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
	if (checkout === undefined) return Result.ok(false);
	const claim = await resolveContextualClaim(event, checkout);
	if (claim === undefined) return Result.ok(false);
	const d = deps();
	// Already claimed: just re-acknowledge, do not re-record (avoid re-notifying
	// admin on a repeated "хийсэн").
	const run = claim.alreadyClaimed
		? async () => {
				await logDeliveryFailure(
					d.sendText(TRANSFER_CLAIM_ACK_MESSAGE),
					"payment.repeat_claim_ack",
				);
				return Result.ok<void, PaymentOperationFailure>(undefined);
			}
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
	run: () => Promise<BetterResult<void, PaymentOperationFailure>>,
): Promise<BetterResult<boolean, MessengerAdmissionFailure>> {
	const claimKey = `messenger:payment:v1:${sessionId}:mid:${mid}`;
	if (mid.length > 0) {
		const claimed = await claimInboundOnce(claimKey, env);
		if (claimed.status === "error") {
			return Result.err<boolean, MessengerAdmissionFailure>(claimed.error);
		}
	}
	try {
		const result = await run();
		if (result.status === "ok") return Result.ok(true);
		console.warn("[payment] operation failed", {
			error_tag: result.error._tag,
			retryable: result.error.retryable,
		});
		return matchAsync(
			result.error,
			"_tag",
		)<BetterResult<boolean, MessengerAdmissionFailure>>({
			RetryablePaymentFailure: async () => {
				if (mid.length > 0) {
					await logReleaseFailure(releaseInboundClaim(claimKey, env));
				}
				return Result.err(
					retryableDeliveryFailure("messenger", "provider_unavailable"),
				);
			},
			AmbiguousPaymentFailure: async () => Result.ok(true),
			PermanentPaymentFailure: async () => Result.ok(true),
			InvalidPaymentRequest: async () => Result.ok(true),
		});
	} catch (error) {
		if (!(error instanceof PaymentPostcommitError) && mid.length > 0) {
			await logReleaseFailure(releaseInboundClaim(claimKey, env));
		}
		throw error;
	}
}

const postMessageOutputSchema = v.variant("status", [
	v.strictObject({
		status: v.literal("delivered"),
		messageId: v.string(),
	}),
	v.strictObject({
		status: v.literal("failed"),
		error: deliveryFailureSchema,
	}),
]);

export function postMessage(ref: MessengerConversationRef) {
	const recipientId = ref.participant.id;
	return defineTool({
		name: "post_messenger_message",
		description:
			"Post a simple text reply to the bound Messenger customer conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		output: postMessageOutputSchema,
		async run({ input }) {
			await bestEffortTyping("on");
			try {
				const result = await sendTextReply(ref)(input.text);
				return result.status === "ok"
					? {
							status: "delivered" as const,
							messageId: result.value.messageId,
						}
					: { status: "failed" as const, error: result.error };
			} finally {
				await bestEffortTyping("off");
			}
		},
	});

	async function bestEffortTyping(action: "on" | "off") {
		try {
			if (action === "on") await messenger.send.typingOn(recipientId);
			else await messenger.send.typingOff(recipientId);
		} catch (error) {
			const failure = classifyMessengerDeliveryFailure(error);
			if (failure === undefined) throw error;
			console.warn("[messenger] typing indicator failed", {
				error_tag: failure._tag,
				provider: failure.provider,
				code: failure.code,
			});
		}
	}
}

export function sendTextReply(ref: MessengerConversationRef) {
	return async (text: string) =>
		sendMessenger(() =>
			messenger.send.message({
				recipient: toRecipient(ref.participant),
				messaging_type: "RESPONSE",
				message: { text },
			}),
		);
}

export function sendCartSummary(ref: MessengerConversationRef) {
	return async (cart: Cart) => {
		const quickReplies = cartQuickReplies(cart).map((quickReply) => ({
			content_type: "text" as const,
			title: quickReply.title,
			payload: quickReply.payload,
		}));
		return sendMessenger(() =>
			messenger.send.message({
				recipient: toRecipient(ref.participant),
				messaging_type: "RESPONSE",
				message: {
					text: formatCartSummary(cart),
					...(quickReplies.length > 0 ? { quick_replies: quickReplies } : {}),
				},
			}),
		);
	};
}

export async function resolveProductById(id: number) {
	const products = await getAssistantProductsByIds([id]);
	return products.map((items) => items[0]);
}

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

		const result = await sendMessenger(() =>
			messenger.templates.generic({
				recipient: toRecipient(ref.participant),
				elements,
				messaging_type: "RESPONSE",
			}),
		);
		return result.map((receipt) => ({
			...receipt,
			cardCount: elements.length,
		}));
	};
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
