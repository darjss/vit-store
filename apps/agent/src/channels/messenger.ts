import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerConversationRef,
} from "@flue/messenger";
import { defineTool, dispatch } from "@flue/runtime";
import * as v from "valibot";
import assistant from "../agents/customer-assistant";
import { MessengerClient } from "../messenger-client";

const graphVersion = "v25.0";

export const client = new MessengerClient({
	pageId: requiredEnv("MESSENGER_PAGE_ID"),
	pageAccessToken: requiredEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
	graphVersion,
});

export const channel: MessengerChannel = createMessengerChannel({
	appSecret: requiredEnv("MESSENGER_APP_SECRET"),
	verifyToken: requiredEnv("MESSENGER_VERIFY_TOKEN"),
	pageId: requiredEnv("MESSENGER_PAGE_ID"),

	// Mounted at GET/POST /channels/messenger/webhook.
	async webhook({ payload }) {
		for (const entry of payload.entry) {
			for (const event of entry.messaging ?? []) {
				if (event.message === undefined || event.message.is_echo) continue;
				const conversation = channel.conversationRef(event);
				const text = event.message.text?.trim();
				if (
					conversation === undefined ||
					text === undefined ||
					text.length === 0
				) {
					continue;
				}

				await client.senderActions.send(conversation.participant, {
					type: "typing_on",
				});
				try {
					await dispatch(assistant, {
						id: channel.conversationKey(conversation),
						input: {
							type: "messenger.message",
							messageId: event.message.mid,
							text,
							attachmentTypes: (event.message.attachments ?? []).map(
								(attachment) => attachment.type,
							),
							quickReplyPayload: event.message.quick_reply?.payload,
						},
					});
				} finally {
					await client.senderActions.send(conversation.participant, {
						type: "typing_off",
					});
				}
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
			const result = await client.messages.sendText({
				to: ref.participant,
				text: input.text,
				messagingType: "RESPONSE",
			});
			return {
				...(result.messageId === undefined
					? {}
					: { messageId: result.messageId }),
			};
		},
	});
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
