import { Api } from "grammy";
import type { Update } from "@flue/telegram";
import { dispatch } from "@flue/runtime";
import {
	TELEGRAM_CALLBACK_ACTIONS,
	parseTelegramCallbackData,
} from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import adminAssistant from "../agents/admin-assistant";
import { shipAllPaidPendingOrders } from "../lib/ship-paid-orders";
import { withTelegramTyping } from "../lib/telegram-typing";
import { claimInboundOnce } from "./messenger-admission";
import { conversationFromMessage, isAdminUser, type TelegramWebhookEnv } from "./telegram";

export const TELEGRAM_CALLBACK = TELEGRAM_CALLBACK_ACTIONS;

const confirmMessages = {
	[TELEGRAM_CALLBACK.PRICE_NO]: (draftMessageId: number) =>
		`❌ Цуцаллаа (draft message ${draftMessageId}): үнийн өөрчлөлт.`,
	[TELEGRAM_CALLBACK.PRICE_OK]: (draftMessageId: number) =>
		`✅ Баталгаажууллаа (draft message ${draftMessageId}): үнийг шинэчилнэ.`,
	[TELEGRAM_CALLBACK.STOCK_NO]: (draftMessageId: number) =>
		`❌ Цуцаллаа (draft message ${draftMessageId}): нөөц шинэчлэл.`,
	[TELEGRAM_CALLBACK.STOCK_OK]: (draftMessageId: number) =>
		`✅ Баталгаажууллаа (draft message ${draftMessageId}): нөөц шинэчлэлийг хэрэгжүүлнэ.`,
} satisfies Record<string, (draftMessageId: number) => string>;

const formatShipAllResult = (result: Awaited<ReturnType<typeof shipAllPaidPendingOrders>>) => {
	const lines = ["📦 Илгээлтийн үр дүн", ""];
	if (result.shipped.length > 0) {
		lines.push(`Илгээгдсэн (${result.shipped.length}):`, ...result.shipped.map((n) => `• ${n}`));
	}
	if (result.skipped.length > 0) {
		if (result.shipped.length > 0) {
			lines.push("");
		}
		lines.push(
			`Алгассан (${result.skipped.length}):`,
			...result.skipped.map((s) => `• ${s.orderNumber}: ${s.reason}`),
		);
	}
	if (result.shipped.length === 0 && result.skipped.length === 0) {
		lines.push("Илгээх төлбөртэй захиалга алга.");
	}
	return lines.join("\n");
};

const clearInlineButtons = async (api: Api, chatId: number, messageId: number) => {
	await api.editMessageReplyMarkup(chatId, messageId, {
		reply_markup: { inline_keyboard: [] },
	});
};

type CallbackInput = {
	channel: {
		conversationKey: (ref: ReturnType<typeof conversationFromMessage>) => string;
	};
	env: TelegramWebhookEnv;
	update: Update;
};

async function handleShipAllCallback(
	input: CallbackInput,
	api: Api,
	query: NonNullable<Update["callback_query"]>,
	boundMessageId: number,
) {
	const chatId = query.message!.chat.id;
	if (boundMessageId !== query.message!.message_id) {
		await api.sendMessage(chatId, "Энэ товч энэ мессежид хамаарахгүй.");
		return;
	}

	const dedupeKey = `telegram:ship_all:v1:${chatId}:${boundMessageId}`;
	if (!(await claimInboundOnce(dedupeKey, input.env))) {
		return;
	}

	const storeApiUrl = (input.env.STORE_API_URL ?? process.env.STORE_API_URL)?.trim();
	const botToken = (input.env.ADMIN_BOT_TOKEN ?? process.env.ADMIN_BOT_TOKEN)?.trim();
	if (!storeApiUrl || !botToken) {
		await api.sendMessage(chatId, "Илгээх тохиргоо дутуу байна (STORE_API_URL, ADMIN_BOT_TOKEN).");
		return;
	}

	const result = await withTelegramTyping(api, chatId, () =>
		shipAllPaidPendingOrders({
			botToken,
			storeApiUrl,
		}),
	);
	await clearInlineButtons(api, chatId, boundMessageId);
	await api.sendMessage(chatId, formatShipAllResult(result), {
		link_preview_options: { is_disabled: true },
	});
}

function isConfirmAction(action: string): action is keyof typeof confirmMessages {
	return action in confirmMessages;
}

async function handleConfirmCallback(
	input: CallbackInput,
	api: Api,
	query: NonNullable<Update["callback_query"]>,
	action: keyof typeof confirmMessages,
	boundMessageId: number,
) {
	const buildConfirmText = confirmMessages[action];
	if (!buildConfirmText || query.message!.chat.type !== "private") {
		return;
	}

	const chatId = query.message!.chat.id;
	if (boundMessageId !== query.message!.message_id) {
		await api.sendMessage(chatId, "Энэ баталгаажуулалт хуучирсан байна.");
		return;
	}

	const dedupeKey = `telegram:confirm:v1:${chatId}:${boundMessageId}:${action}`;
	if (!(await claimInboundOnce(dedupeKey, input.env))) {
		return;
	}

	const sessionId = input.channel.conversationKey(conversationFromMessage(query.message!));
	await clearInlineButtons(api, chatId, boundMessageId);
	await withTelegramTyping(api, chatId, () =>
		dispatch(adminAssistant, {
			id: sessionId,
			input: {
				text: buildConfirmText(boundMessageId),
				type: "telegram.message",
				updateId: input.update.update_id,
			},
		}),
	);
}

export async function handleTelegramCallback(input: CallbackInput) {
	const query = input.update.callback_query;
	if (!query?.message) {
		return undefined;
	}
	if (!isAdminUser(query.from.id, input.env)) {
		return undefined;
	}

	const token = input.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	if (!token) {
		return undefined;
	}

	const api = new Api(token);
	const previewAction = parseTelegramCallbackData(query.data?.trim() ?? "").action;
	if (previewAction === TELEGRAM_CALLBACK.SHIP_ALL) {
		await api.answerCallbackQuery(query.id, { text: "Илгээж байна…" });
	} else {
		await api.answerCallbackQuery(query.id);
	}

	const data = query.data?.trim();
	if (!data) {
		return undefined;
	}

	const { action, messageId: boundMessageId } = parseTelegramCallbackData(data);
	if (action === TELEGRAM_CALLBACK.SHIP_ALL) {
		if (boundMessageId === undefined) {
			await api.sendMessage(query.message.chat.id, "Энэ товч хуучирсан байна.");
			return undefined;
		}
		await handleShipAllCallback(input, api, query, boundMessageId);
		return undefined;
	}

	if (boundMessageId !== undefined && isConfirmAction(action)) {
		await handleConfirmCallback(input, api, query, action, boundMessageId);
	}

	return undefined;
}
