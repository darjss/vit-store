import type { Api } from "grammy";
import {
	parseTelegramCallbackData,
	TELEGRAM_CALLBACK_ACTIONS,
} from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import type { Env } from "../env";
import { shipAllPaidPendingOrders } from "./ship-paid-orders";
import { adminApi, isAdminUser, type TelegramCallbackQuery } from "./telegram";
import { withTelegramTyping } from "./telegram-typing";

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

// The pieces the Admin DO lends the callback handler: a durable claim (the
// old MessengerAdmissionStore) and a way to run a model turn for the confirm
// texts.
export type CallbackDeps = {
	claimOnce: (key: string) => boolean;
	enqueueTurn: (text: string, updateId: number, chatId: number) => Promise<void>;
};

const handleShipAllCallback = async (
	env: Env,
	deps: CallbackDeps,
	api: Api,
	query: TelegramCallbackQuery,
	boundMessageId: number,
) => {
	const message = query.message;
	if (message === undefined) {
		return;
	}
	const chatId = message.chat.id;
	if (boundMessageId !== message.message_id) {
		await api.sendMessage(chatId, "Энэ товч энэ мессежид хамаарахгүй.");
		return;
	}

	if (!deps.claimOnce(`ship_all:${chatId}:${boundMessageId}`)) {
		return;
	}

	const storeApiUrl = env.STORE_API_URL?.trim();
	const botToken = env.ADMIN_BOT_TOKEN?.trim();
	if (storeApiUrl === undefined || botToken === undefined || storeApiUrl === "") {
		await api.sendMessage(chatId, "Илгээх тохиргоо дутуу байна (STORE_API_URL, ADMIN_BOT_TOKEN).");
		return;
	}

	const result = await withTelegramTyping(api, chatId, () =>
		shipAllPaidPendingOrders({ botToken, storeApiUrl }),
	);
	await clearInlineButtons(api, chatId, boundMessageId);
	await api.sendMessage(chatId, formatShipAllResult(result), {
		link_preview_options: { is_disabled: true },
	});
};

const isConfirmAction = (action: string): action is keyof typeof confirmMessages =>
	action in confirmMessages;

const handleConfirmCallback = async (
	deps: CallbackDeps,
	api: Api,
	query: TelegramCallbackQuery,
	action: keyof typeof confirmMessages,
	boundMessageId: number,
	updateId: number,
) => {
	const buildConfirmText = confirmMessages[action];
	const message = query.message;
	if (message === undefined || message.chat.type !== "private") {
		return;
	}

	const chatId = message.chat.id;
	if (boundMessageId !== message.message_id) {
		await api.sendMessage(chatId, "Энэ баталгаажуулалт хуучирсан байна.");
		return;
	}

	if (!deps.claimOnce(`confirm:${chatId}:${boundMessageId}:${action}`)) {
		return;
	}

	await clearInlineButtons(api, chatId, boundMessageId);
	// The queued turn runs its own typing loop; enqueue so the webhook returns
	// without waiting on the model.
	await deps.enqueueTurn(buildConfirmText(boundMessageId), updateId, chatId);
};

export const handleTelegramCallback = async (
	env: Env,
	deps: CallbackDeps,
	query: TelegramCallbackQuery,
	updateId: number,
): Promise<void> => {
	if (query.message === undefined) {
		return;
	}
	if (!isAdminUser(query.from.id, env)) {
		return;
	}
	const api = adminApi(env);
	if (api === undefined) {
		return;
	}

	const data = query.data?.trim() ?? "";
	const previewAction = parseTelegramCallbackData(data).action;
	if (previewAction === TELEGRAM_CALLBACK.SHIP_ALL) {
		await api.answerCallbackQuery(query.id, { text: "Илгээж байна…" });
	} else {
		await api.answerCallbackQuery(query.id);
	}
	if (data === "") {
		return;
	}

	const { action, messageId: boundMessageId } = parseTelegramCallbackData(data);
	if (action === TELEGRAM_CALLBACK.SHIP_ALL) {
		if (boundMessageId === undefined) {
			await api.sendMessage(query.message.chat.id, "Энэ товч хуучирсан байна.");
			return;
		}
		await handleShipAllCallback(env, deps, api, query, boundMessageId);
		return;
	}

	if (boundMessageId !== undefined && isConfirmAction(action)) {
		await handleConfirmCallback(deps, api, query, action, boundMessageId, updateId);
	}
};
