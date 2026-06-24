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
};

const admittedInProcess = new Set<string>();

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
	};
}

async function claimOnce(key: string, env?: AdmissionEnv): Promise<boolean> {
	if (admittedInProcess.has(key)) return false;

	const store = env?.MESSENGER_ADMISSION_STORE;
	if (store !== undefined) {
		const id = store.idFromName(key);
		const response = await store
			.get(id)
			.fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
				method: "POST",
			});
		const result = (await response.json()) as { admitted?: boolean };
		if (result.admitted !== true) {
			admittedInProcess.add(key);
			return false;
		}
	}

	admittedInProcess.add(key);
	return true;
}
