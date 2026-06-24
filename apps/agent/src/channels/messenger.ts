import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
} from "@flue/messenger";
import { defineTool, dispatch } from "@flue/runtime";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import { MessengerClient } from "../messenger-client";
import { admitMessengerTextMessage } from "./messenger-admission";

const graphVersion = "v25.0";

export const client = new MessengerClient({
	pageAccessToken: requiredEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
	graphVersion,
});

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

				await client.senderActions.send(
					admission.conversation.participant,
					"typing_on",
				);
				await dispatch(assistant, {
					id: admission.sessionId,
					input: {
						type: "messenger.message",
						messageId: admission.messageId,
						text: admission.text,
						attachmentTypes: admission.attachmentTypes,
						quickReplyPayload: admission.quickReplyPayload,
					},
				});
			}
		}
		return undefined;
	},
});

export function postMessage(ref: MessengerConversationRef) {
	return defineTool({
		name: "post_messenger_message",
		description:
			"Post a simple text reply to the bound Messenger customer conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			try {
				const result = await client.messages.sendText({
					to: ref.participant,
					text: input.text,
				});
				return {
					...(result.message_id === undefined
						? {}
						: { messageId: result.message_id }),
				};
			} finally {
				await client.senderActions.send(ref.participant, "typing_off");
			}
		},
	});
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
