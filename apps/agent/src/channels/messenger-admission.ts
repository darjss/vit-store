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
