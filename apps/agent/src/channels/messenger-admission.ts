import { admissionResponseSchema } from "../lib/admission-response";
import type { ZernioMessageEvent } from "./messenger";
import { parse } from "valibot";

// A bound Messenger conversation under Zernio: the Zernio account the webhook
// arrived on plus Zernio's conversation id (used both as the session-key
// component and as the send path's {conversationId}).
export type MessengerConversationRef = {
	accountId: string;
	conversationId: string;
};

export const conversationRefFor = (event: ZernioMessageEvent): MessengerConversationRef => ({
	accountId: event.account.accountId ?? event.account.id,
	conversationId: event.conversation.id,
});

// Session key shape: `zernio:v1:<accountId>:<conversationId>`. The event's
// account id is pinned so the same customer talking to a different connected
// account gets a distinct session.
export const conversationKey = (ref: MessengerConversationRef): string =>
	`zernio:v1:${ref.accountId}:${ref.conversationId}`;

export const parseConversationKey = (id: string): MessengerConversationRef => {
	if (!id.startsWith("zernio:v1:")) {
		throw new Error(`Malformed Messenger conversation key: ${id}`);
	}
	const rest = id.slice("zernio:v1:".length);
	const separator = rest.indexOf(":");
	const accountId = separator === -1 ? rest : rest.slice(0, separator);
	const conversationId = separator === -1 ? "" : rest.slice(separator + 1);
	if (accountId.length === 0 || conversationId.length === 0) {
		throw new Error(`Malformed Messenger conversation key: ${id}`);
	}
	return { accountId, conversationId };
};

type AdmissionEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
};

export type MessengerTextAdmission = {
	attachmentTypes: Array<string>;
	conversation: MessengerConversationRef;
	messageId: string;
	quickReplyPayload?: string;
	/** Drop the dedupe claim so a failed turn can be re-delivered. */
	release(): Promise<void>;
	sessionId: string;
	text: string;
};

// Bounded fast-path in front of the durable store: an optimization that skips a
// DO round-trip for event ids this isolate already saw, never a fallback for it.
const IN_PROCESS_LIMIT = 1024;
const admittedInProcess = new Map<string, true>();

export async function admitMessengerTextMessage(input: {
	env?: AdmissionEnv;
	event: ZernioMessageEvent;
}): Promise<MessengerTextAdmission | undefined> {
	const { env, event } = input;
	if (event.message.direction !== "incoming") {
		return undefined;
	}

	const conversation = conversationRefFor(event);
	// The Zernio event id is identical on every webhook retry: our dedupe key.
	const messageId = event.id;
	const text = event.message.text?.trim();
	if (text === undefined || text.length === 0) {
		return undefined;
	}

	const sessionId = conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	if (!(await claimOnce(dedupeKey, env))) {
		return undefined;
	}

	return {
		attachmentTypes: (event.message.attachments ?? []).map((attachment) => attachment.type),
		conversation,
		messageId,
		quickReplyPayload: event.metadata?.quickReplyPayload,
		release: () => releaseClaim(dedupeKey, env),
		sessionId,
		text,
	};
}

export type MessengerInboundImage = {
	index: number;
	/** Remote attachment URL — fetched server-side, never dispatched. */
	url: string;
};

export type MessengerImageAdmission = {
	/** Optional caption text the customer sent alongside the photo(s). */
	caption: string;
	conversation: MessengerConversationRef;
	images: Array<MessengerInboundImage>;
	messageId: string;
	/** Drop the dedupe claim so a failed turn can be re-delivered. */
	release(): Promise<void>;
	sessionId: string;
};

// Pull image attachments (with a usable url) out of a message event.
// Exported so the webhook can branch to the photo path before admission.
export function extractInboundImages(event: ZernioMessageEvent): Array<MessengerInboundImage> {
	const attachments = event.message.attachments ?? [];
	const images: Array<MessengerInboundImage> = [];
	for (const attachment of attachments) {
		if (attachment.type !== "image") {
			continue;
		}
		const url = attachment.url;
		// url is `string | null` from the event schema; truthiness keeps the
		// non-empty strings.
		if (url) {
			images.push({ index: images.length, url });
		}
	}
	return images;
}

// Admits an inbound image turn and claims its event id for dedupe, mirroring
// `admitMessengerTextMessage` for the text path. Returns undefined when the
// event is not a fresh image message (no usable image, already claimed), so
// the caller can fall through to the text path. The dedupe key shares the text
// namespace (one claim per event id), so a Zernio retry of the same photo event
// is applied at most once.
export async function admitMessengerImageMessage(input: {
	env?: AdmissionEnv;
	event: ZernioMessageEvent;
	/** Pre-extracted images from the webhook, to avoid re-scanning attachments. */
	images?: Array<MessengerInboundImage>;
}): Promise<MessengerImageAdmission | undefined> {
	const { env, event } = input;
	if (event.message.direction !== "incoming") {
		return undefined;
	}

	const images = input.images ?? extractInboundImages(event);
	if (images.length === 0) {
		return undefined;
	}

	const conversation = conversationRefFor(event);
	const messageId = event.id;

	const sessionId = conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	if (!(await claimOnce(dedupeKey, env))) {
		return undefined;
	}

	return {
		caption: event.message.text?.trim() ?? "",
		conversation,
		images,
		messageId,
		release: () => releaseClaim(dedupeKey, env),
		sessionId,
	};
}

// Generic single-claim primitive shared by the text path and the cart-event
// path (postback/quick-reply). Returns true exactly once per key within the
// dedupe window so a Zernio webhook retry of the same event is not applied
// twice (e.g. a duplicate Захиалах add). Callers namespace their own keys.
export async function claimInboundOnce(key: string, env?: AdmissionEnv): Promise<boolean> {
	return claimOnce(key, env);
}

export async function releaseInboundClaim(key: string, env?: AdmissionEnv): Promise<void> {
	return releaseClaim(key, env);
}

async function claimOnce(key: string, env?: AdmissionEnv): Promise<boolean> {
	const store = env?.MESSENGER_ADMISSION_STORE;
	// In the production webhook path `env` is always present; a missing binding
	// there would silently degrade dedupe to per-isolate, so fail loudly instead.
	if (env !== undefined && store === undefined) {
		throw new Error("MESSENGER_ADMISSION_STORE binding is required for Messenger admission.");
	}

	if (admittedInProcess.has(key)) {
		return false;
	}

	// No durable store wired (mock/tests): in-process dedupe is the whole story.
	if (store === undefined) {
		rememberInProcess(key);
		return true;
	}

	const id = store.idFromName(key);
	const response = await store
		.get(id)
		.fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
			method: "POST",
		});
	const admitted = parse(admissionResponseSchema, await response.json()).admitted === true;
	rememberInProcess(key);
	return admitted;
}

async function releaseClaim(key: string, env?: AdmissionEnv): Promise<void> {
	admittedInProcess.delete(key);
	const store = env?.MESSENGER_ADMISSION_STORE;
	if (store === undefined) {
		return;
	}
	const id = store.idFromName(key);
	await store.get(id).fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
		method: "DELETE",
	});
}

function rememberInProcess(key: string): void {
	admittedInProcess.set(key, true);
	if (admittedInProcess.size > IN_PROCESS_LIMIT) {
		const oldest = admittedInProcess.keys().next().value;
		if (oldest !== undefined) {
			admittedInProcess.delete(oldest);
		}
	}
}
