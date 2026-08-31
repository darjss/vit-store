import {
	createTelegramChannel,
	type TelegramConversationRef,
	type Update,
} from "@flue/telegram";
import { defineTool, dispatch } from "@flue/runtime";
import { Api } from "grammy";
import * as v from "valibot";
import adminAssistant from "../agents/admin-assistant";
import { stageInboundBytes } from "../lib/messenger-inbound";
import {
	claimInboundOnce,
	releaseInboundClaim,
} from "./messenger-admission";

type WebhookEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
	TELEGRAM_ADMIN_BOT_TOKEN?: string;
	TELEGRAM_ADMIN_CHAT_ID?: string;
};

const telegramApi = (token: string) => new Api(token);

export const channel = createTelegramChannel({
	secretToken: requiredEnv("TELEGRAM_WEBHOOK_SECRET"),
	async webhook({ c, update }) {
		const env = c.env as WebhookEnv;
		const message = update.message;
		if (!message) return undefined;

		const fromId = message.from?.id;
		if (fromId === undefined || !isAdminUser(fromId, env)) return undefined;
		if (message.chat.type !== "private") return undefined;

		const text = message.text?.trim() ?? message.caption?.trim() ?? "";
		const photos = message.photo;
		if (!text && (!photos || photos.length === 0)) return undefined;

		const conversation = conversationFromMessage(message);
		const sessionId = channel.conversationKey(conversation);
		const dedupeKey = `telegram:update:v1:${update.update_id}`;
		if (!(await claimInboundOnce(dedupeKey, env))) return undefined;

		const imageKeys: string[] = [];
		if (photos && photos.length > 0) {
			const bucket = env.MESSENGER_INBOUND_BUCKET;
			const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
			if (!bucket || !token) {
				await releaseInboundClaim(dedupeKey, env);
				throw new Error(
					"MESSENGER_INBOUND_BUCKET and TELEGRAM_ADMIN_BOT_TOKEN are required for Telegram photos.",
				);
			}
			const largest = photos[photos.length - 1]!;
			const file = await telegramApi(token).getFile(largest.file_id);
			if (!file.file_path) {
				await releaseInboundClaim(dedupeKey, env);
				return undefined;
			}
			const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
			const response = await fetch(fileUrl);
			if (!response.ok || response.body === null) {
				await releaseInboundClaim(dedupeKey, env);
				return undefined;
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			const staged = await stageInboundBytes(
				bucket,
				{
					sessionId,
					messageId: String(message.message_id),
					index: 0,
				},
				bytes,
				"image/jpeg",
				"telegram-inbound",
			);
			if (staged) imageKeys.push(staged.key);
		}

		if (imageKeys.length === 0 && !text) {
			await releaseInboundClaim(dedupeKey, env);
			return undefined;
		}

		try {
			await dispatch(adminAssistant, {
				id: sessionId,
				input: {
					type: "telegram.message",
					text,
					updateId: update.update_id,
					...(imageKeys.length > 0 ? { imageKeys } : {}),
				},
			});
		} catch (error) {
			await releaseInboundClaim(dedupeKey, env);
			throw error;
		}
		return undefined;
	},
});

function isAdminUser(userId: number, env: WebhookEnv) {
	const raw = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
	if (!raw) return false;
	const allowed = Number(raw);
	return Number.isSafeInteger(allowed) && allowed === userId;
}

function conversationFromMessage(
	message: NonNullable<Update["message"]>,
): TelegramConversationRef {
	const topic = {
		...(message.message_thread_id === undefined
			? {}
			: { messageThreadId: message.message_thread_id }),
		...(message.direct_messages_topic?.topic_id === undefined
			? {}
			: { directMessagesTopicId: message.direct_messages_topic.topic_id }),
	};
	return message.business_connection_id
		? {
				type: "business-chat",
				businessConnectionId: message.business_connection_id,
				chatId: message.chat.id,
				...topic,
			}
		: { type: "chat", chatId: message.chat.id, ...topic };
}

export function postTelegramMessage(ref: TelegramConversationRef) {
	const token = requiredEnv("TELEGRAM_ADMIN_BOT_TOKEN");
	return defineTool({
		name: "post_telegram_message",
		description:
			"Post a text reply to the bound Telegram admin conversation.",
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const sent = await telegramApi(token).sendMessage(ref.chatId, input.text, {
				...(ref.type === "business-chat"
					? { business_connection_id: ref.businessConnectionId }
					: {}),
				...(ref.messageThreadId
					? { message_thread_id: ref.messageThreadId }
					: {}),
				...(ref.directMessagesTopicId
					? { direct_messages_topic_id: ref.directMessagesTopicId }
					: {}),
			});
			return { ok: true, messageId: sent.message_id };
		},
	});
}

function requiredEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
