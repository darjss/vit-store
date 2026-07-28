import type {
	MessengerChannel,
	MessengerConversationRef,
	MessengerMessagingEvent,
} from "@flue/messenger";
import {
	type DeliveryFailure,
	duplicateInboundDelivery,
	invalidDelivery,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import * as v from "valibot";

type AdmissionEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
};

export type MessengerAdmissionFailure = Extract<
	DeliveryFailure,
	| { _tag: "DuplicateInboundDelivery" }
	| { _tag: "InvalidDelivery" }
	| { _tag: "RetryableDeliveryFailure" }
>;

export type MessengerAdmissionReleaseFailure = Extract<
	DeliveryFailure,
	{ _tag: "InvalidDelivery" } | { _tag: "RetryableDeliveryFailure" }
>;

export type MessengerTextAdmission = {
	conversation: MessengerConversationRef;
	sessionId: string;
	messageId: string;
	text: string;
	attachmentTypes: string[];
	quickReplyPayload?: string;
	/** Drop the dedupe claim so a failed turn can be delivered again. */
	release(): Promise<BetterResult<void, MessengerAdmissionReleaseFailure>>;
};

const claimResponseSchema = v.strictObject({ admitted: v.boolean() });
const releaseResponseSchema = v.strictObject({ released: v.literal(true) });

// Bounded fast path in front of the durable store. This skips a DO call for a
// message ID that this isolate has seen. It is not a durable fallback.
const IN_PROCESS_LIMIT = 1024;
const admittedInProcess = new Map<string, true>();

export async function admitMessengerTextMessage(input: {
	channel: MessengerChannel;
	event: MessengerMessagingEvent;
	env?: AdmissionEnv;
}) {
	const { channel, event, env } = input;
	if (event.message === undefined || event.message.is_echo) {
		return Result.ok<
			MessengerTextAdmission | undefined,
			MessengerAdmissionFailure
		>(undefined);
	}

	const text = event.message.text?.trim();
	if (text === undefined || text.length === 0) {
		return Result.ok<
			MessengerTextAdmission | undefined,
			MessengerAdmissionFailure
		>(undefined);
	}

	const conversation = channel.conversationRef(event);
	const messageId = event.message.mid;
	if (conversation === undefined || messageId.length === 0) {
		return Result.err<
			MessengerTextAdmission | undefined,
			MessengerAdmissionFailure
		>(invalidDelivery("messenger", "invalid_payload"));
	}

	const sessionId = channel.conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	const claimed = await claimOnce(dedupeKey, env);
	if (claimed.status === "error") return claimed;

	return Result.ok<MessengerTextAdmission, MessengerAdmissionFailure>({
		conversation,
		sessionId,
		messageId,
		text,
		attachmentTypes: (event.message.attachments ?? []).map(
			(attachment) => attachment.type,
		),
		quickReplyPayload: event.message.quick_reply?.payload,
		release: () => releaseClaim(dedupeKey, env),
	});
}

export type MessengerInboundImage = {
	/** Meta CDN attachment URL. This value is fetched but never dispatched. */
	url: string;
	index: number;
};

export type MessengerImageAdmission = {
	conversation: MessengerConversationRef;
	sessionId: string;
	messageId: string;
	/** Optional caption text the customer sent with the images. */
	caption: string;
	images: MessengerInboundImage[];
	/** Drop the dedupe claim so a failed turn can be delivered again. */
	release(): Promise<BetterResult<void, MessengerAdmissionReleaseFailure>>;
};

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

export async function admitMessengerImageMessage(input: {
	channel: MessengerChannel;
	event: MessengerMessagingEvent;
	env?: AdmissionEnv;
	/** Pre-extracted images from the webhook. */
	images?: MessengerInboundImage[];
}) {
	const { channel, event, env } = input;
	if (event.message === undefined || event.message.is_echo) {
		return Result.ok<
			MessengerImageAdmission | undefined,
			MessengerAdmissionFailure
		>(undefined);
	}

	const images = input.images ?? extractInboundImages(event);
	if (images.length === 0) {
		return Result.ok<
			MessengerImageAdmission | undefined,
			MessengerAdmissionFailure
		>(undefined);
	}

	const conversation = channel.conversationRef(event);
	const messageId = event.message.mid;
	if (conversation === undefined || messageId.length === 0) {
		return Result.err<
			MessengerImageAdmission | undefined,
			MessengerAdmissionFailure
		>(invalidDelivery("messenger", "invalid_payload"));
	}

	const sessionId = channel.conversationKey(conversation);
	const dedupeKey = `messenger:inbound:v1:${sessionId}:mid:${messageId}`;
	const claimed = await claimOnce(dedupeKey, env);
	if (claimed.status === "error") return claimed;

	return Result.ok<MessengerImageAdmission, MessengerAdmissionFailure>({
		conversation,
		sessionId,
		messageId,
		caption: event.message.text?.trim() ?? "",
		images,
		release: () => releaseClaim(dedupeKey, env),
	});
}

export async function claimInboundOnce(key: string, env?: AdmissionEnv) {
	return claimOnce(key, env);
}

export async function releaseInboundClaim(key: string, env?: AdmissionEnv) {
	return releaseClaim(key, env);
}

async function claimOnce(
	key: string,
	env?: AdmissionEnv,
): Promise<BetterResult<void, MessengerAdmissionFailure>> {
	const store = env?.MESSENGER_ADMISSION_STORE;
	if (env !== undefined && store === undefined) {
		throw new Error(
			"MESSENGER_ADMISSION_STORE binding is required for Messenger admission.",
		);
	}

	if (key.length === 0) {
		return Result.err(invalidDelivery("messenger", "invalid_payload"));
	}
	if (admittedInProcess.has(key)) {
		return Result.err(duplicateInboundDelivery());
	}

	if (store === undefined) {
		rememberInProcess(key);
		return Result.ok(undefined);
	}

	let response: Response;
	try {
		const id = store.idFromName(key);
		response = await store
			.get(id)
			.fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
				method: "POST",
			});
	} catch {
		return Result.err(
			retryableDeliveryFailure("messenger", "provider_unavailable"),
		);
	}

	if (!response.ok) {
		return response.status >= 500
			? Result.err(
					retryableDeliveryFailure("messenger", "provider_unavailable"),
				)
			: Result.err(invalidDelivery("messenger", "malformed_response"));
	}

	const parsed = v.parse(claimResponseSchema, await response.json());
	if (!parsed.admitted) return Result.err(duplicateInboundDelivery());

	rememberInProcess(key);
	return Result.ok(undefined);
}

async function releaseClaim(
	key: string,
	env?: AdmissionEnv,
): Promise<BetterResult<void, MessengerAdmissionReleaseFailure>> {
	admittedInProcess.delete(key);
	const store = env?.MESSENGER_ADMISSION_STORE;
	if (env !== undefined && store === undefined) {
		throw new Error(
			"MESSENGER_ADMISSION_STORE binding is required for Messenger admission.",
		);
	}
	if (store === undefined) return Result.ok(undefined);

	let response: Response;
	try {
		const id = store.idFromName(key);
		response = await store
			.get(id)
			.fetch(`https://messenger-admission/${encodeURIComponent(key)}`, {
				method: "DELETE",
			});
	} catch {
		return Result.err(
			retryableDeliveryFailure("messenger", "provider_unavailable"),
		);
	}

	if (!response.ok) {
		return response.status >= 500
			? Result.err(
					retryableDeliveryFailure("messenger", "provider_unavailable"),
				)
			: Result.err(invalidDelivery("messenger", "malformed_response"));
	}

	v.parse(releaseResponseSchema, await response.json());
	return Result.ok(undefined);
}

function rememberInProcess(key: string) {
	admittedInProcess.set(key, true);
	if (admittedInProcess.size > IN_PROCESS_LIMIT) {
		const oldest = admittedInProcess.keys().next().value;
		if (oldest !== undefined) admittedInProcess.delete(oldest);
	}
}
