import { createTelegramChannel, type TelegramConversationRef, type Update } from "@flue/telegram";
import { defineTool, dispatch } from "@flue/runtime";
import { Api, InputFile } from "grammy";
import * as v from "valibot";
import adminAssistant from "../agents/admin-assistant";
import { createAdminBotClient } from "../lib/admin-bot-client";
import { bindTelegramButtonCallbacks } from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import { stageInboundBytes } from "../lib/messenger-inbound";
import { withTelegramTyping } from "../lib/telegram-typing";
import { handleTelegramCallback } from "./telegram-callbacks";
import { claimInboundOnce, releaseInboundClaim } from "./messenger-admission";

export type TelegramWebhookEnv = {
	ADMIN_BOT_TOKEN?: string;
	MESSENGER_ADMISSION_STORE?: DurableObjectNamespace;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
	STORE_API_URL?: string;
	TELEGRAM_ADMIN_BOT_TOKEN?: string;
	TELEGRAM_ADMIN_CHAT_ID?: string;
};

const telegramApi = (token: string) => new Api(token);

const telegramButtonSchema = v.object({
	callback_data: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	text: v.pipe(v.string(), v.minLength(1)),
});

export const channel = createTelegramChannel({
	secretToken: requiredEnv("TELEGRAM_WEBHOOK_SECRET"),
	// ponytail: split inbound dispatch from admin gating; complexity ceiling 28
	// oxlint-disable-next-line complexity
	async webhook({ c, update }) {
		// SAFETY: c.env is the Workers env for this worker; TelegramWebhookEnv lists the bindings it reads.
		const env = c.env as TelegramWebhookEnv;

		if (update.callback_query) {
			return handleTelegramCallback({ channel, env, update });
		}

		const message = update.message;
		if (!message) {
			return undefined;
		}

		const fromId = message.from?.id;
		if (fromId === undefined || message.chat.type !== "private") {
			return undefined;
		}

		if (isIdCommand(message.text)) {
			await replyWithUserId(env, message.chat.id, fromId);
			return undefined;
		}

		if (!isAdminUser(fromId, env)) {
			console.info(
				JSON.stringify({
					event: "telegram.admin_reject",
					fromId,
					username: message.from?.username ?? null,
				}),
			);
			return undefined;
		}

		const text = message.text?.trim() ?? message.caption?.trim() ?? "";
		const photos = message.photo;
		if (!text && (!photos || photos.length === 0)) {
			return undefined;
		}

		const conversation = conversationFromMessage(message);
		const sessionId = channel.conversationKey(conversation);
		const dedupeKey = `telegram:update:v1:${update.update_id}`;
		if (!(await claimInboundOnce(dedupeKey, env))) {
			return undefined;
		}

		const imageKeys: Array<string> = [];
		if (photos && photos.length > 0) {
			const key = await stageTelegramPhoto({ env, message, photos, sessionId }).catch(
				async (error) => {
					await releaseInboundClaim(dedupeKey, env);
					throw error;
				},
			);
			if (key === "unavailable") {
				await releaseInboundClaim(dedupeKey, env);
				return undefined;
			}
			if (key !== "not-staged") {
				imageKeys.push(key);
			}
		}

		if (imageKeys.length === 0 && !text) {
			await releaseInboundClaim(dedupeKey, env);
			return undefined;
		}

		try {
			const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
			const dispatchTurn = () =>
				dispatch(adminAssistant, {
					id: sessionId,
					input:
						imageKeys.length > 0
							? { imageKeys, text, type: "telegram.message", updateId: update.update_id }
							: { text, type: "telegram.message", updateId: update.update_id },
				});

			if (token) {
				const api = telegramApi(token);
				await withTelegramTyping(
					api,
					message.chat.id,
					dispatchTurn,
					imageKeys.length > 0 ? "upload_photo" : "typing",
				);
			} else {
				await dispatchTurn();
			}
		} catch (error) {
			await releaseInboundClaim(dedupeKey, env);
			throw error;
		}
		return undefined;
	},
});

type TelegramPhotos = NonNullable<NonNullable<Update["message"]>["photo"]>;

// Anyone in a private chat can ask for their Telegram user id so we can
// add them to TELEGRAM_ADMIN_CHAT_ID (comma-separated allowlist).
function isIdCommand(text: string | undefined) {
	const command = (text?.trim() ?? "").toLowerCase();
	return command === "/id" || command === "/whoami";
}

async function replyWithUserId(env: TelegramWebhookEnv, chatId: number, fromId: number) {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	if (!token) {
		return;
	}
	await telegramApi(token).sendMessage(chatId, `Your Telegram user id: ${fromId}`);
}

/** Stages the largest photo in R2. "unavailable" means Telegram did not return the file. */
async function stageTelegramPhoto({
	env,
	message,
	photos,
	sessionId,
}: {
	env: TelegramWebhookEnv;
	message: NonNullable<Update["message"]>;
	photos: TelegramPhotos;
	sessionId: string;
}): Promise<string | "unavailable" | "not-staged"> {
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	if (!bucket || !token) {
		throw new Error(
			"MESSENGER_INBOUND_BUCKET and TELEGRAM_ADMIN_BOT_TOKEN are required for Telegram photos.",
		);
	}
	const largest = photos.at(-1);
	if (!largest) {
		return "unavailable";
	}
	const file = await telegramApi(token).getFile(largest.file_id);
	if (!file.file_path) {
		return "unavailable";
	}
	const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
	if (!response.ok || response.body === null) {
		return "unavailable";
	}
	const staged = await stageInboundBytes(
		bucket,
		{ index: 0, messageId: String(message.message_id), sessionId },
		new Uint8Array(await response.arrayBuffer()),
		"image/jpeg",
		"telegram-inbound",
	);
	return staged ? staged.key : "not-staged";
}

/** Comma/space-separated Telegram user ids allowed to use the admin bot. */
export function parseAdminUserIds(raw: string | undefined): Array<number> {
	if (!raw?.trim()) {
		return [];
	}
	return raw
		.split(/[,\s]+/)
		.map((part) => Number(part.trim()))
		.filter((id) => Number.isSafeInteger(id) && id !== 0);
}

export function isAdminUser(userId: number, env: TelegramWebhookEnv) {
	return parseAdminUserIds(env.TELEGRAM_ADMIN_CHAT_ID).includes(userId);
}

type TelegramTopic = { directMessagesTopicId?: number; messageThreadId?: number };

export function conversationFromMessage(
	message: NonNullable<Update["message"]>,
): TelegramConversationRef {
	const topic: TelegramTopic = {};
	if (message.message_thread_id !== undefined) {
		topic.messageThreadId = message.message_thread_id;
	}
	if (message.direct_messages_topic?.topic_id !== undefined) {
		topic.directMessagesTopicId = message.direct_messages_topic.topic_id;
	}
	return message.business_connection_id
		? {
				businessConnectionId: message.business_connection_id,
				chatId: message.chat.id,
				type: "business-chat",
				...topic,
			}
		: { chatId: message.chat.id, type: "chat", ...topic };
}

type TelegramSendOptions = {
	business_connection_id?: string;
	direct_messages_topic_id?: number;
	message_thread_id?: number;
};

const sendOptions = (ref: TelegramConversationRef) => {
	const options: TelegramSendOptions = {};
	if (ref.type === "business-chat") {
		options.business_connection_id = ref.businessConnectionId;
	}
	if (ref.messageThreadId) {
		options.message_thread_id = ref.messageThreadId;
	}
	if (ref.directMessagesTopicId) {
		options.direct_messages_topic_id = ref.directMessagesTopicId;
	}
	return options;
};

export function postTelegramMessage(ref: TelegramConversationRef) {
	const token = requiredEnv("TELEGRAM_ADMIN_BOT_TOKEN");
	return defineTool({
		description:
			"Post a text reply to the bound Telegram admin conversation. Optional inline buttons for confirmations.",
		input: v.object({
			buttons: v.optional(v.array(telegramButtonSchema)),
			text: v.pipe(v.string(), v.minLength(1)),
		}),
		name: "post_telegram_message",
		async run({ input }) {
			const sent = await telegramApi(token).sendMessage(ref.chatId, input.text, {
				...sendOptions(ref),
				link_preview_options: { is_disabled: true },
			});
			if (input.buttons?.length) {
				await telegramApi(token).editMessageReplyMarkup(ref.chatId, sent.message_id, {
					reply_markup: {
						inline_keyboard: [bindTelegramButtonCallbacks(input.buttons, sent.message_id)],
					},
				});
			}
			return { messageId: sent.message_id, ok: true };
		},
	});
}

export function postTelegramProductPhoto(input: {
	botToken: string;
	ref: TelegramConversationRef;
	storeApiUrl: string;
}) {
	const token = requiredEnv("TELEGRAM_ADMIN_BOT_TOKEN");
	return defineTool({
		description: "Send a product's image with an optional caption to the admin Telegram chat.",
		input: v.object({
			caption: v.optional(v.string()),
			productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		}),
		name: "post_telegram_product_photo",
		async run({ input: toolInput }) {
			const client = createAdminBotClient(input.storeApiUrl, input.botToken);
			const product = await client.product.getProductById.query({
				id: toolInput.productId,
			});
			if (!product) {
				throw new Error(`Product ${toolInput.productId} not found`);
			}
			const imageUrl =
				product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url;
			if (!imageUrl) {
				throw new Error(`Product ${toolInput.productId} has no image`);
			}
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(`Product image fetch failed: ${response.status} ${imageUrl}`);
			}
			const sent = await telegramApi(token).sendPhoto(
				input.ref.chatId,
				new InputFile(await response.bytes(), "product.jpg"),
				toolInput.caption
					? { ...sendOptions(input.ref), caption: toolInput.caption }
					: sendOptions(input.ref),
			);
			return { messageId: sent.message_id, ok: true };
		},
	});
}

function requiredEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required.`);
	}
	return value;
}
