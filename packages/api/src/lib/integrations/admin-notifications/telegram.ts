import { Bot } from "gramio";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";
import { bindTelegramButtonCallbacks } from "./telegram-callback-data";

type TelegramAdminConfig = {
	chatIds: Array<string>;
	token: string;
};

type ProductImageInput = {
	imageUrl?: string;
	name: string;
	quantity: number;
};

let bot: Bot | undefined;
let initPromise: Promise<void> | undefined;

export const getTelegramAdminConfig = (): TelegramAdminConfig | null => {
	const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	// Same comma-separated allowlist the agent uses for inbound; outbound
	// alerts go to every admin in the list.
	const chatIds = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "")
		.split(/[,\s]+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (!token || chatIds.length === 0) {
		return null;
	}
	return { chatIds, token };
};

const getApi = async () => {
	const config = getTelegramAdminConfig();
	if (!config) {
		throw new Error("TELEGRAM_ADMIN_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID must be set");
	}

	bot ??= new Bot(config.token);
	if (!initPromise) {
		initPromise = bot
			.init()
			.then(() => undefined)
			.catch((error) => {
				initPromise = undefined;
				bot = undefined;
				throw error;
			});
	}
	await initPromise;

	return { api: bot.api, chatIds: config.chatIds };
};

// Fan a send out to every admin chat. A single unreachable chat (blocked bot,
// stale id) must not break or duplicate delivery for the others, so failures
// are logged per chat and only an all-chat failure throws.
const forEachChat = async <T>(
	send: (api: Bot["api"], chatId: string) => Promise<T>,
): Promise<Array<T>> => {
	const { api, chatIds } = await getApi();
	const results = await Promise.allSettled(
		chatIds.map(async (chatId) => ({ chatId, value: await send(api, chatId) })),
	);
	const delivered: Array<T> = [];
	const failed: Array<{ chatId: string; reason: unknown }> = [];
	for (const [index, result] of results.entries()) {
		if (result.status === "fulfilled") {
			delivered.push(result.value.value);
		} else {
			failed.push({
				chatId: chatIds[index] ?? "unknown",
				reason: result.reason,
			});
		}
	}
	for (const failure of failed) {
		logger.error("telegram.admin_send_failed", parseCaught(failure.reason), {
			chatId: failure.chatId,
		});
	}
	if (delivered.length === 0 && failed.length > 0) {
		throw failed[0].reason;
	}
	return delivered;
};

const fetchImageBlob = async (photoUrl: string) => {
	const response = await fetch(photoUrl);
	if (!response.ok) {
		throw new Error(`product image fetch failed: ${response.status} ${photoUrl}`);
	}
	return response.blob();
};

export type TelegramInlineButton = {
	callback_data: string;
	text: string;
};

export const sendTelegramText = async (text: string) => {
	await forEachChat((api, chatId) =>
		api.sendMessage({
			chat_id: chatId,
			link_preview_options: { is_disabled: true },
			text,
		}),
	);
};

export const sendTelegramTextReturningId = async (text: string) =>
	forEachChat(async (api, chatId) => {
		const sent = await api.sendMessage({
			chat_id: chatId,
			link_preview_options: { is_disabled: true },
			text,
		});
		return { chatId, messageId: sent.message_id };
	});

export const setTelegramInlineButtons = async (
	chatId: string,
	messageId: number,
	buttons: Array<TelegramInlineButton>,
) => {
	const { api } = await getApi();
	await api.editMessageReplyMarkup({
		chat_id: chatId,
		message_id: messageId,
		reply_markup: {
			inline_keyboard: [
				buttons.map((button) => ({
					callback_data: button.callback_data,
					text: button.text,
				})),
			],
		},
	});
};

export const clearTelegramInlineButtons = async (chatId: string, messageId: number) => {
	const { api } = await getApi();
	await api.editMessageReplyMarkup({
		chat_id: chatId,
		message_id: messageId,
		reply_markup: { inline_keyboard: [] },
	});
};

export const sendTelegramTextWithButtons = async (
	text: string,
	buttons: Array<TelegramInlineButton>,
) => {
	const sent = await sendTelegramTextReturningId(text);
	await Promise.all(
		sent.map(({ chatId, messageId }) =>
			setTelegramInlineButtons(chatId, messageId, bindTelegramButtonCallbacks(buttons, messageId)),
		),
	);
	return sent;
};

export const sendTelegramPhoto = async (photoUrl: string, caption?: string) => {
	const photo = await fetchImageBlob(photoUrl);
	await forEachChat((api, chatId) =>
		caption
			? api.sendPhoto({ caption, chat_id: chatId, photo })
			: api.sendPhoto({ chat_id: chatId, photo }),
	);
};

const sendSinglePhoto = async (blob: Blob, caption: string | undefined) => {
	await forEachChat((api, chatId) =>
		caption
			? api.sendPhoto({ caption, chat_id: chatId, photo: blob })
			: api.sendPhoto({ chat_id: chatId, photo: blob }),
	);
};

const sendPhotoAlbum = async (blobs: Array<Blob>) => {
	await forEachChat((api, chatId) =>
		api.sendMediaGroup({
			chat_id: chatId,
			media: blobs.map((blob) => ({
				media: blob,
				type: "photo" as const,
			})),
		}),
	);
};

const safeSendSinglePhoto = async (blob: Blob, caption: string | undefined) => {
	try {
		await sendSinglePhoto(blob, caption);
	} catch {
		// Skip broken/oversized images; other products may still send.
	}
};

const safeSendPhotoChunk = async (chunk: Array<{ blob: Blob; product: ProductImageInput }>) => {
	if (chunk.length === 1) {
		const { blob, product } = chunk[0];
		await safeSendSinglePhoto(blob, `${product.name} x${product.quantity}`);
		return;
	}
	try {
		await sendPhotoAlbum(chunk.map(({ blob }) => blob));
	} catch {
		for (const { blob, product } of chunk) {
			await safeSendSinglePhoto(blob, `${product.name} x${product.quantity}`);
		}
	}
};

export const sendTelegramProductImages = async (products: Array<ProductImageInput>) => {
	const loaded = (
		await Promise.all(
			products.map(async (product) => {
				if (!product.imageUrl) {
					return null;
				}
				try {
					const blob = await fetchImageBlob(product.imageUrl);
					return { blob, product };
				} catch {
					return null;
				}
			}),
		)
	).filter((item) => item !== null);

	if (loaded.length === 0) {
		return;
	}

	for (let index = 0; index < loaded.length; index += 10) {
		await safeSendPhotoChunk(loaded.slice(index, index + 10));
	}
};
