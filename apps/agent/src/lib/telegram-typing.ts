import type { Api } from "grammy";

const TYPING_REFRESH_MS = 4000;

export type TelegramChatAction = "typing" | "upload_photo";

export const withTelegramTyping = async <T>(
	api: Api,
	chatId: number,
	run: () => Promise<T>,
	action: TelegramChatAction = "typing",
): Promise<T> => {
	let stopped = false;
	const pulse = async () => {
		try {
			await api.sendChatAction(chatId, action);
		} catch {
			// Typing indicators are cosmetic; never fail the turn over one.
		}
	};

	await pulse();
	const timer = setInterval(() => {
		if (!stopped) {
			void pulse();
		}
	}, TYPING_REFRESH_MS);

	try {
		return await run();
	} finally {
		stopped = true;
		clearInterval(timer);
	}
};
