import type {
	MessengerChannel,
	MessengerConversationRef,
	MessengerMessagingEvent,
} from "@flue/messenger";

type AdmissionEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
};

export type MessengerTextAdmission = {
	conversation: MessengerConversationRef;
	sessionId: string;
	messageId: string;
	text: string;
	attachmentTypes: string[];
	quickReplyPayload?: string;
	/** Drop the dedupe claim so a failed turn can be re-delivered. */
	release(): Promise<void>;
};

// Bounded fast-path in front of the durable store: an optimization that skips a
// DO round-trip for mids this isolate already saw, never a fallback for it.
const IN_PROCESS_LIMIT = 1024;
const admittedInProcess = new Map<string, true>();

export async function admitMessengerTextMessage(input: {
	channel: MessengerChannel;
	event: MessengerMessagingEvent;
	env?: AdmissionEnv;
}): Promise<MessengerTextAdmission | undefined> {
	const { channel, event, env } = input;
	if (event.message === undefined || event.message.is_echo) return undefined;

	const conversation = channel.conversationRef(event);
	const messageId = event.message.mid;
	const text = event.message.text?.trim();
	if (
		conversation === undefined ||
		messageId.length === 0 ||
		text === undefined ||
		text.length === 0
	) {
		return undefined;
	}

	const sessionId = channel.conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	if (!(await claimOnce(dedupeKey, env))) return undefined;

	return {
		conversation,
		sessionId,
		messageId,
		text,
		attachmentTypes: (event.message.attachments ?? []).map(
			(attachment) => attachment.type,
		),
		quickReplyPayload: event.message.quick_reply?.payload,
		release: () => releaseClaim(dedupeKey, env),
	};
}

export type MessengerInboundImage = {
	/** Meta CDN attachment URL — fetched server-side, never dispatched. */
	url: string;
	index: number;
};

export type MessengerImageAdmission = {
	conversation: MessengerConversationRef;
	sessionId: string;
	messageId: string;
	/** Optional caption text the customer sent alongside the photo(s). */
	caption: string;
	images: MessengerInboundImage[];
	/** Drop the dedupe claim so a failed turn can be re-delivered. */
	release(): Promise<void>;
};

// Pull image attachments (with a usable Meta CDN url) out of a message event.
// Exported so the webhook can branch to the photo path before admission.
export function extractInboundImages(
	event: MessengerMessagingEvent,
): MessengerInboundImage[] {
	const attachments = event.message?.attachments ?? [];
	const images: MessengerInboundImage[] = [];
	for (const attachment of attachments) {
		if (attachment.type !== "image") continue;
		const url = attachment.payload?.url;
		if (typeof url === "string" && url.length > 0) {
			images.push({ url, index: images.length });
		}
	}
	return images;
}

// Admits an inbound image turn and claims its mid for dedupe, mirroring
// `admitMessengerTextMessage` for the text path. Returns undefined when the
// event is not a fresh image message (echo, no usable image, already claimed),
// so the caller can fall through to the text path. The dedupe key shares the
// text namespace (one claim per mid), so a Meta retry of the same photo mid is
// applied at most once.
export async function admitMessengerImageMessage(input: {
	channel: MessengerChannel;
	event: MessengerMessagingEvent;
	env?: AdmissionEnv;
}): Promise<MessengerImageAdmission | undefined> {
	const { channel, event, env } = input;
	if (event.message === undefined || event.message.is_echo) return undefined;

	const images = extractInboundImages(event);
	if (images.length === 0) return undefined;

	const conversation = channel.conversationRef(event);
	const messageId = event.message.mid;
	if (conversation === undefined || messageId.length === 0) return undefined;

	const sessionId = channel.conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	if (!(await claimOnce(dedupeKey, env))) return undefined;

	return {
		conversation,
		sessionId,
		messageId,
		caption: event.message.text?.trim() ?? "",
		images,
		release: () => releaseClaim(dedupeKey, env),
	};
}

// Generic single-claim primitive shared by the text path and the cart-event
// path (postback/quick-reply). Returns true exactly once per key within the
// dedupe window so a Meta webhook retry of the same mid is not applied twice
// (e.g. a duplicate Захиалах add). Callers namespace their own keys.
export async function claimInboundOnce(
	key: string,
	env?: AdmissionEnv,
): Promise<boolean> {
	return claimOnce(key, env);
}

export async function releaseInboundClaim(
	key: string,
	env?: AdmissionEnv,
): Promise<void> {
	return releaseClaim(key, env);
}

async function claimOnce(key: string, env?: AdmissionEnv): Promise<boolean> {
	const store = env?.MESSENGER_ADMISSION_STORE;
	// In the production webhook path `env` is always present; a missing binding
	// there would silently degrade dedupe to per-isolate, so fail loudly instead.
	if (env !== undefined && store === undefined) {
		throw new Error(
			"MESSENGER_ADMISSION_STORE binding is required for Messenger admission.",
		);
	}

	if (admittedInProcess.has(key)) return false;

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
	const result = (await response.json()) as { admitted?: boolean };
	rememberInProcess(key);
	return result.admitted === true;
}

async function releaseClaim(key: string, env?: AdmissionEnv): Promise<void> {
	admittedInProcess.delete(key);
	const store = env?.MESSENGER_ADMISSION_STORE;
	if (store === undefined) return;
	const id = store.idFromName(key);
	await store
		.get(id)
		.fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
			method: "DELETE",
		});
}

function rememberInProcess(key: string): void {
	admittedInProcess.set(key, true);
	if (admittedInProcess.size > IN_PROCESS_LIMIT) {
		const oldest = admittedInProcess.keys().next().value;
		if (oldest !== undefined) admittedInProcess.delete(oldest);
	}
}
