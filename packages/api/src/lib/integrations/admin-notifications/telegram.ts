import { Bot } from "gramio";

type TelegramAdminConfig = {
	chatId: string;
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
	const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
	if (!token || !chatId) {
		return null;
	}
	return { chatId, token };
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

	return { api: bot.api, chatId: config.chatId };
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
	const { api, chatId } = await getApi();
	await api.sendMessage({
		chat_id: chatId,
		link_preview_options: { is_disabled: true },
		text,
	});
};

export const sendTelegramTextReturningId = async (text: string) => {
	const { api, chatId } = await getApi();
	const sent = await api.sendMessage({
		chat_id: chatId,
		link_preview_options: { is_disabled: true },
		text,
	});
	return sent.message_id;
};

export const setTelegramInlineButtons = async (
	messageId: number,
	buttons: Array<TelegramInlineButton>,
) => {
	const { api, chatId } = await getApi();
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

export const clearTelegramInlineButtons = async (messageId: number) => {
	const { api, chatId } = await getApi();
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
	const messageId = await sendTelegramTextReturningId(text);
	await setTelegramInlineButtons(messageId, buttons);
	return messageId;
};

export const sendTelegramPhoto = async (photoUrl: string, caption?: string) => {
	const { api, chatId } = await getApi();
	const photo = await fetchImageBlob(photoUrl);
	await api.sendPhoto({
		chat_id: chatId,
		photo,
		...(caption ? { caption } : {}),
	});
};

const sendSinglePhoto = async (blob: Blob, caption: string | undefined) => {
	const { api, chatId } = await getApi();
	await api.sendPhoto({
		chat_id: chatId,
		photo: blob,
		...(caption ? { caption } : {}),
	});
};

const sendPhotoAlbum = async (blobs: Array<Blob>) => {
	const { api, chatId } = await getApi();
	await api.sendMediaGroup({
		chat_id: chatId,
		media: blobs.map((blob) => ({
			media: blob,
			type: "photo" as const,
		})),
	});
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
