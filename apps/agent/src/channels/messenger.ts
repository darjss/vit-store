import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
	type MessengerParticipantRef,
} from "@flue/messenger";
import { defineTool, dispatch } from "@flue/runtime";
import { Messenger, type Recipient } from "@warriorteam/messenger-sdk";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import { admitMessengerTextMessage } from "./messenger-admission";

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
		for (const entry of payload.entry) {
			for (const event of entry.messaging ?? []) {
				const admission = await admitMessengerTextMessage({
					channel,
					event,
					env: c.env,
				});
				if (admission === undefined) continue;

				// dispatch() is the durable commit point. If it throws before the
				// turn is durably enqueued, release the dedupe claim and rethrow so
				// Meta's retry can re-deliver instead of being swallowed by dedupe.
				try {
					await dispatch(assistant, {
						id: admission.sessionId,
						input: {
							type: "messenger.message",
							messageId: admission.messageId,
							text: admission.text,
							attachmentTypes: admission.attachmentTypes,
							// dispatch() input must be JSON-clean: omit the key entirely
							// when there is no quick reply rather than passing undefined.
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
		}
		return undefined;
	},
});

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

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
