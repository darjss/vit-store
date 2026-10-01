import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import { Api, InputFile } from "grammy";
import * as v from "valibot";
import { bindTelegramButtonCallbacks } from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import type { Env } from "../env";
import { stageInboundBytes } from "./inbound";
import { createAdminBotClient } from "./admin-bot-client";
import { withTelegramTyping } from "./telegram-typing";

// Telegram Update, parsed at the webhook boundary with only the fields the
// admin path reads.
const telegramUserSchema = v.looseObject({
	id: v.number(),
	username: v.optional(v.string()),
});

const telegramPhotoSchema = v.looseObject({
	file_id: v.string(),
});

const telegramChatSchema = v.looseObject({
	id: v.number(),
	type: v.string(),
});

export const telegramMessageSchema = v.looseObject({
	business_connection_id: v.optional(v.string()),
	caption: v.optional(v.string()),
	chat: telegramChatSchema,
	direct_messages_topic: v.optional(v.looseObject({ topic_id: v.number() })),
	from: v.optional(telegramUserSchema),
	message_id: v.number(),
	message_thread_id: v.optional(v.number()),
	photo: v.optional(v.array(telegramPhotoSchema)),
	text: v.optional(v.string()),
});

export const telegramUpdateSchema = v.looseObject({
	callback_query: v.optional(
		v.looseObject({
			data: v.optional(v.string()),
			from: telegramUserSchema,
			id: v.string(),
			message: v.optional(telegramMessageSchema),
		}),
	),
	message: v.optional(telegramMessageSchema),
	update_id: v.number(),
});

export type TelegramUpdate = v.InferOutput<typeof telegramUpdateSchema>;
export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
export type TelegramCallbackQuery = NonNullable<TelegramUpdate["callback_query"]>;

export const adminApi = (env: Env): Api | undefined => {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	if (!token) {
		return undefined;
	}
	const apiRoot = env.TELEGRAM_API_BASE?.trim();
	return apiRoot === undefined || apiRoot === "" ? new Api(token) : new Api(token, { apiRoot });
};

/** Comma/space-separated Telegram user ids allowed to use the admin bot. */
export const parseAdminUserIds = (raw: string | undefined): Array<number> =>
	(raw ?? "")
		.split(/[,\s]+/)
		.map((part) => Number(part.trim()))
		.filter((id) => Number.isSafeInteger(id) && id !== 0);

export const isAdminUser = (userId: number, env: Env): boolean =>
	parseAdminUserIds(env.TELEGRAM_ADMIN_CHAT_ID).includes(userId);

// Anyone in a private chat can ask for their Telegram user id so we can add
// them to TELEGRAM_ADMIN_CHAT_ID.
const isIdCommand = (text: string | undefined): boolean => {
	const command = (text?.trim() ?? "").toLowerCase();
	return command === "/id" || command === "/whoami";
};

// Private-chat admins only. Anyone can ask for their user id to get added to
// the allowlist.
export const admitSender = async (
	env: Env,
	message: TelegramMessage,
): Promise<"reject" | "reply" | "ok"> => {
	const fromId = message.from?.id;
	if (fromId === undefined || message.chat.type !== "private") {
		return "reject";
	}
	if (isIdCommand(message.text)) {
		const api = adminApi(env);
		if (api !== undefined) {
			await api.sendMessage(message.chat.id, `Your Telegram user id: ${fromId}`);
		}
		return "reply";
	}
	if (!isAdminUser(fromId, env)) {
		console.info(
			JSON.stringify({
				event: "telegram.admin_reject",
				fromId,
				username: message.from?.username ?? null,
			}),
		);
		return "reject";
	}
	return "ok";
};

type StagedPhoto =
	| { key: string; status: "staged" }
	| { status: "not-staged" }
	| { status: "unavailable" };

// Stages the largest photo in R2. "unavailable" means Telegram did not return
// the file.
export const stageTelegramPhoto = async ({
	api,
	env,
	message,
	sessionId,
}: {
	api: Api;
	env: Env;
	message: TelegramMessage;
	sessionId: string;
}): Promise<StagedPhoto> => {
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (bucket === undefined) {
		throw new Error("MESSENGER_INBOUND_BUCKET is required for Telegram photos.");
	}
	const largest = message.photo?.at(-1);
	if (largest === undefined) {
		return { status: "unavailable" };
	}
	const file = await api.getFile(largest.file_id);
	if (file.file_path === undefined) {
		return { status: "unavailable" };
	}
	const apiRoot = env.TELEGRAM_API_BASE?.trim() ?? "https://api.telegram.org";
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim() ?? "";
	const response = await fetch(`${apiRoot.replace(/\/+$/, "")}/file/bot${token}/${file.file_path}`);
	if (!response.ok || response.body === null) {
		return { status: "unavailable" };
	}
	const staged = await stageInboundBytes(
		bucket,
		{ index: 0, messageId: String(message.message_id), sessionId },
		new Uint8Array(await response.arrayBuffer()),
		"image/jpeg",
		"telegram-inbound",
	);
	return staged === undefined ? { status: "not-staged" } : { key: staged.key, status: "staged" };
};

const telegramButtonSchema = v.object({
	callback_data: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	text: v.pipe(v.string(), v.minLength(1)),
});

// Admin chats are private chats, so sends carry no thread/business options.
export const postTelegramMessageTool = (env: Env, chatId: number, posted: { did: boolean }) =>
	tool({
		description:
			"Post a text reply to the bound Telegram admin conversation. Optional inline buttons for confirmations.",
		execute: async ({ buttons, text }) => {
			const api = adminApi(env);
			if (api === undefined) {
				return { error: "TELEGRAM_ADMIN_BOT_TOKEN missing", ok: false };
			}
			const sent = await api.sendMessage(chatId, text, {
				link_preview_options: { is_disabled: true },
			});
			posted.did = true;
			if (buttons !== undefined && buttons.length > 0) {
				await api.editMessageReplyMarkup(chatId, sent.message_id, {
					reply_markup: {
						inline_keyboard: [bindTelegramButtonCallbacks(buttons, sent.message_id)],
					},
				});
			}
			return { messageId: sent.message_id, ok: true };
		},
		inputSchema: valibotSchema(
			v.object({
				buttons: v.optional(v.array(telegramButtonSchema)),
				text: v.pipe(v.string(), v.minLength(1)),
			}),
		),
	});

export const postTelegramProductPhotoTool = (env: Env, chatId: number, posted: { did: boolean }) =>
	tool({
		description: "Send a product's image with an optional caption to the admin Telegram chat.",
		execute: async ({ caption, productId }) => {
			const api = adminApi(env);
			const botToken = env.ADMIN_BOT_TOKEN?.trim();
			if (api === undefined || botToken === undefined) {
				return { error: "TELEGRAM_ADMIN_BOT_TOKEN or ADMIN_BOT_TOKEN missing", ok: false };
			}
			const client = createAdminBotClient(env.STORE_API_URL, botToken);
			const product = await client.product.getProductById.query({ id: productId });
			if (product === null || product === undefined) {
				throw new Error(`Product ${productId} not found`);
			}
			const imageUrl =
				product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url;
			if (imageUrl === undefined) {
				throw new Error(`Product ${productId} has no image`);
			}
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(`Product image fetch failed: ${response.status} ${imageUrl}`);
			}
			const sent = await api.sendPhoto(
				chatId,
				new InputFile(await response.bytes(), "product.jpg"),
				caption === undefined ? {} : { caption },
			);
			posted.did = true;
			return { messageId: sent.message_id, ok: true };
		},
		inputSchema: valibotSchema(
			v.object({
				caption: v.optional(v.string()),
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		),
	});

// Typing indicator for a DO-hosted turn; matches the old channel behavior of
// pulsing sendChatAction while the model runs. `upload_photo` while a photo is
// being staged/processed.
export const runWithTyping = async <T>(
	env: Env,
	chatId: number,
	run: () => Promise<T>,
	action: "typing" | "upload_photo" = "typing",
): Promise<T> => {
	const api = adminApi(env);
	if (api === undefined) {
		return run();
	}
	return withTelegramTyping(api, chatId, run, action);
};
