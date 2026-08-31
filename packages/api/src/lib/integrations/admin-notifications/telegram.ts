import { Bot } from "gramio";

type TelegramAdminConfig = {
	token: string;
	chatId: string;
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
	initPromise ??= bot.init().then(() => undefined);
	await initPromise;

	return { api: bot.api, chatId: config.chatId };
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
	await api.sendPhoto({
		chat_id: chatId,
		photo: photoUrl,
		...(caption ? { caption } : {}),
	});
};
