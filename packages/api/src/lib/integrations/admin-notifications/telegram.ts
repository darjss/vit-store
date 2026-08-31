import { Bot } from "gramio";

type TelegramAdminConfig = {
	token: string;
	chatId: string;
};

type ProductImageInput = {
	name: string;
	quantity: number;
	imageUrl?: string;
};

let bot: Bot | undefined;
let initPromise: Promise<void> | undefined;

export const getTelegramAdminConfig = (): TelegramAdminConfig | null => {
	const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
	if (!token || !chatId) return null;
	return { token, chatId };
};

const getApi = async () => {
	const config = getTelegramAdminConfig();
	if (!config) {
		throw new Error(
			"TELEGRAM_ADMIN_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID must be set",
		);
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

export const sendTelegramText = async (text: string) => {
	const { api, chatId } = await getApi();
	await api.sendMessage({
		chat_id: chatId,
		text,
		link_preview_options: { is_disabled: true },
	});
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

const sendPhotoAlbum = async (blobs: Blob[]) => {
	const { api, chatId } = await getApi();
	await api.sendMediaGroup({
		chat_id: chatId,
		media: blobs.map((blob) => ({
			type: "photo" as const,
			media: blob,
		})),
	});
};

const safeSendSinglePhoto = async (
	blob: Blob,
	caption: string | undefined,
) => {
	try {
		await sendSinglePhoto(blob, caption);
	} catch {
		// Skip broken/oversized images; other products may still send.
	}
};

const safeSendPhotoChunk = async (
	chunk: Array<{ product: ProductImageInput; blob: Blob }>,
) => {
	if (chunk.length === 1) {
		const { product, blob } = chunk[0];
		await safeSendSinglePhoto(blob, `${product.name} x${product.quantity}`);
		return;
	}
	try {
		await sendPhotoAlbum(chunk.map(({ blob }) => blob));
	} catch {
		for (const { product, blob } of chunk) {
			await safeSendSinglePhoto(blob, `${product.name} x${product.quantity}`);
		}
	}
};

export const sendTelegramProductImages = async (
	products: ProductImageInput[],
) => {
	const loaded = (
		await Promise.all(
			products.map(async (product) => {
				if (!product.imageUrl) return null;
				try {
					const blob = await fetchImageBlob(product.imageUrl);
					return { product, blob };
				} catch {
					return null;
				}
			}),
		)
	).filter((item) => item !== null);

	if (loaded.length === 0) return;

	for (let index = 0; index < loaded.length; index += 10) {
		await safeSendPhotoChunk(loaded.slice(index, index + 10));
	}
};
