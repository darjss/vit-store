import { createTelegramChannel, type TelegramConversationRef, type Update } from "@flue/telegram";
import { defineTool, dispatch } from "@flue/runtime";
import { Api, InputFile } from "grammy";
import {
	array,
	integer,
	maxLength,
	minLength,
	minValue,
	number,
	object,
	optional,
	pipe,
	string,
} from "valibot";
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

async function stageTelegramInboundPhotos(input: {
	bucket: R2Bucket;
	dedupeKey: string;
	env: TelegramWebhookEnv;
	message: NonNullable<Update["message"]>;
	photos: NonNullable<NonNullable<Update["message"]>["photo"]>;
	sessionId: string;
	token: string;
}): Promise<Array<string>> {
	const largest = input.photos.at(-1)!;
	const file = await telegramApi(input.token).getFile(largest.file_id);
	if (!file.file_path) {
		await releaseInboundClaim(input.dedupeKey, input.env);
		return [];
	}
	const fileUrl = `https://api.telegram.org/file/bot${input.token}/${file.file_path}`;
	const response = await fetch(fileUrl);
	if (!response.ok || response.body === null) {
		await releaseInboundClaim(input.dedupeKey, input.env);
		return [];
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	const staged = await stageInboundBytes(
		input.bucket,
		{
			index: 0,
			messageId: String(input.message.message_id),
			sessionId: input.sessionId,
		},
		bytes,
		"image/jpeg",
		"telegram-inbound",
	);
	return staged ? [staged.key] : [];
}

async function dispatchTelegramAdminTurn(input: {
	dedupeKey: string;
	env: TelegramWebhookEnv;
	imageKeys: Array<string>;
	message: NonNullable<Update["message"]>;
	sessionId: string;
	text: string;
	updateId: number;
}) {
	try {
		const token = input.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
		const dispatchInput = {
			text: input.text,
			type: "telegram.message" as const,
			updateId: input.updateId,
		};
		if (input.imageKeys.length > 0) {
			dispatchInput.imageKeys = input.imageKeys;
		}
		const dispatchTurn = () =>
			dispatch(adminAssistant, {
				id: input.sessionId,
				input: dispatchInput,
			});

		if (token) {
			const api = telegramApi(token);
			await withTelegramTyping(
				api,
				input.message.chat.id,
				dispatchTurn,
				input.imageKeys.length > 0 ? "upload_photo" : "typing",
			);
		} else {
			await dispatchTurn();
		}
	} catch (error) {
		await releaseInboundClaim(input.dedupeKey, input.env);
		throw error;
	}
}

const telegramButtonSchema = object({
	callback_data: pipe(string(), minLength(1), maxLength(64)),
	text: pipe(string(), minLength(1)),
});

async function handleTelegramAdminMessage(input: {
	dedupeKey: string;
	env: TelegramWebhookEnv;
	message: NonNullable<Update["message"]>;
	sessionId: string;
	text: string;
	updateId: number;
}) {
	const photos = input.message.photo;
	let imageKeys: Array<string> = [];
	if (photos && photos.length > 0) {
		const bucket = input.env.MESSENGER_INBOUND_BUCKET;
		const token = input.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
		if (!bucket || !token) {
			await releaseInboundClaim(input.dedupeKey, input.env);
			throw new Error(
				"MESSENGER_INBOUND_BUCKET and TELEGRAM_ADMIN_BOT_TOKEN are required for Telegram photos.",
			);
		}
		imageKeys = await stageTelegramInboundPhotos({
			bucket,
			dedupeKey: input.dedupeKey,
			env: input.env,
			message: input.message,
			photos,
			sessionId: input.sessionId,
			token,
		});
	}

	if (imageKeys.length === 0 && !input.text) {
		await releaseInboundClaim(input.dedupeKey, input.env);
		return undefined;
	}

	await dispatchTelegramAdminTurn({
		dedupeKey: input.dedupeKey,
		env: input.env,
		imageKeys,
		message: input.message,
		sessionId: input.sessionId,
		text: input.text,
		updateId: input.updateId,
	});
	return undefined;
}

export const channel = createTelegramChannel({
	secretToken: requiredEnv("TELEGRAM_WEBHOOK_SECRET"),
	async webhook({ c, update }) {
		const env = c.env;

		if (update.callback_query) {
			return handleTelegramCallback({ channel, env, update });
		}

		const message = update.message;
		if (!message) {
			return undefined;
		}

		const fromId = message.from?.id;
		if (fromId === undefined || !isAdminUser(fromId, env) || message.chat.type !== "private") {
			return undefined;
		}

		const text = message.text?.trim() ?? message.caption?.trim() ?? "";
		if (!text && (!message.photo || message.photo.length === 0)) {
			return undefined;
		}

		const sessionId = channel.conversationKey(conversationFromMessage(message));
		const dedupeKey = `telegram:update:v1:${update.update_id}`;
		if (!(await claimInboundOnce(dedupeKey, env))) {
			return undefined;
		}

		return handleTelegramAdminMessage({
			dedupeKey,
			env,
			message,
			sessionId,
			text,
			updateId: update.update_id,
		});
	},
});

export function isAdminUser(userId: number, env: TelegramWebhookEnv) {
	const raw = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
	if (!raw) {
		return false;
	}
	const allowed = Number(raw);
	return Number.isSafeInteger(allowed) && allowed === userId;
}

export function conversationFromMessage(
	message: NonNullable<Update["message"]>,
): TelegramConversationRef {
	const topic = {};
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

const sendOptions = (ref: TelegramConversationRef) => {
	const options = {};
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
		input: object({
			buttons: optional(array(telegramButtonSchema)),
			text: pipe(string(), minLength(1)),
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
		input: object({
			caption: optional(string()),
			productId: pipe(number(), integer(), minValue(1)),
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
			const photoOptions = {};
			if (toolInput.caption) {
				photoOptions.caption = toolInput.caption;
			}
			const sent = await telegramApi(token).sendPhoto(
				input.ref.chatId,
				new InputFile(await response.bytes(), "product.jpg"),
				{
					...sendOptions(input.ref),
					...photoOptions,
				},
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
