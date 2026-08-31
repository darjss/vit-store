import {
	createTelegramChannel,
	type TelegramConversationRef,
	type Update,
} from "@flue/telegram";
import { defineTool, dispatch } from "@flue/runtime";
import { Api, InputFile } from "grammy";
import * as v from "valibot";
import adminAssistant from "../agents/admin-assistant";
import { createAdminBotClient } from "../lib/admin-bot-client";
import { bindTelegramButtonCallbacks } from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import { stageInboundBytes } from "../lib/messenger-inbound";
import { handleTelegramCallback } from "./telegram-callbacks";
import {
	claimInboundOnce,
	releaseInboundClaim,
} from "./messenger-admission";

export type TelegramWebhookEnv = {
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
	TELEGRAM_ADMIN_BOT_TOKEN?: string;
	TELEGRAM_ADMIN_CHAT_ID?: string;
	ADMIN_BOT_TOKEN?: string;
	STORE_API_URL?: string;
};

const telegramApi = (token: string) => new Api(token);

const telegramButtonSchema = v.object({
	text: v.pipe(v.string(), v.minLength(1)),
	callback_data: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
});

export const channel = createTelegramChannel({
	secretToken: requiredEnv("TELEGRAM_WEBHOOK_SECRET"),
	async webhook({ c, update }) {
		const env = c.env as TelegramWebhookEnv;

		if (update.callback_query) {
			return handleTelegramCallback({ update, env, channel });
		}

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

export function isAdminUser(userId: number, env: TelegramWebhookEnv) {
	const raw = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
	if (!raw) return false;
	const allowed = Number(raw);
	return Number.isSafeInteger(allowed) && allowed === userId;
}

export function conversationFromMessage(
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

const sendOptions = (ref: TelegramConversationRef) => ({
	...(ref.type === "business-chat"
		? { business_connection_id: ref.businessConnectionId }
		: {}),
	...(ref.messageThreadId ? { message_thread_id: ref.messageThreadId } : {}),
	...(ref.directMessagesTopicId
		? { direct_messages_topic_id: ref.directMessagesTopicId }
		: {}),
});

export function postTelegramMessage(ref: TelegramConversationRef) {
	const token = requiredEnv("TELEGRAM_ADMIN_BOT_TOKEN");
	return defineTool({
		name: "post_telegram_message",
		description:
			"Post a text reply to the bound Telegram admin conversation. Optional inline buttons for confirmations.",
		input: v.object({
			text: v.pipe(v.string(), v.minLength(1)),
			buttons: v.optional(v.array(telegramButtonSchema)),
		}),
		async run({ input }) {
			const sent = await telegramApi(token).sendMessage(ref.chatId, input.text, {
				...sendOptions(ref),
				link_preview_options: { is_disabled: true },
			});
			if (input.buttons?.length) {
				await telegramApi(token).editMessageReplyMarkup(
					ref.chatId,
					sent.message_id,
					{
						reply_markup: {
							inline_keyboard: [
								bindTelegramButtonCallbacks(
									input.buttons,
									sent.message_id,
								),
							],
						},
					},
				);
			}
			return { ok: true, messageId: sent.message_id };
		},
	});
}

export function postTelegramProductPhoto(input: {
	ref: TelegramConversationRef;
	storeApiUrl: string;
	botToken: string;
}) {
	const token = requiredEnv("TELEGRAM_ADMIN_BOT_TOKEN");
	return defineTool({
		name: "post_telegram_product_photo",
		description:
			"Send a product's image with an optional caption to the admin Telegram chat.",
		input: v.object({
			productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			caption: v.optional(v.string()),
		}),
		async run({ input: toolInput }) {
			const client = createAdminBotClient(
				input.storeApiUrl,
				input.botToken,
			);
			const product = await client.product.getProductById.query({
				id: toolInput.productId,
			});
			if (!product) {
				throw new Error(`Product ${toolInput.productId} not found`);
			}
			const imageUrl =
				product.images.find((image) => image.isPrimary)?.url ??
				product.images[0]?.url;
			if (!imageUrl) {
				throw new Error(`Product ${toolInput.productId} has no image`);
			}
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(
					`Product image fetch failed: ${response.status} ${imageUrl}`,
				);
			}
			const sent = await telegramApi(token).sendPhoto(
				input.ref.chatId,
				new InputFile(await response.bytes(), "product.jpg"),
				{
					...sendOptions(input.ref),
					...(toolInput.caption ? { caption: toolInput.caption } : {}),
				},
			);
			return { ok: true, messageId: sent.message_id };
		},
	});
}

function requiredEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required.`);
	return value;
}
