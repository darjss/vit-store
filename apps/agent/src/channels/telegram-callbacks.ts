import { Api } from "grammy";
import type { Update } from "@flue/telegram";
import { dispatch } from "@flue/runtime";
import {
	TELEGRAM_CALLBACK_ACTIONS,
	parseTelegramCallbackData,
} from "@vit/api/lib/integrations/admin-notifications/telegram-callback-data";
import adminAssistant from "../agents/admin-assistant";
import { shipAllPaidPendingOrders } from "../lib/ship-paid-orders";
import {
	claimInboundOnce,
} from "./messenger-admission";
import {
	conversationFromMessage,
	isAdminUser,
	type TelegramWebhookEnv,
} from "./telegram";

export const TELEGRAM_CALLBACK = TELEGRAM_CALLBACK_ACTIONS;

const confirmMessages: Record<
	string,
	(draftMessageId: number) => string
> = {
	[TELEGRAM_CALLBACK.STOCK_OK]: (draftMessageId) =>
		`✅ Баталгаажууллаа (draft message ${draftMessageId}): нөөц шинэчлэлийг хэрэгжүүлнэ.`,
	[TELEGRAM_CALLBACK.STOCK_NO]: (draftMessageId) =>
		`❌ Цуцаллаа (draft message ${draftMessageId}): нөөц шинэчлэл.`,
	[TELEGRAM_CALLBACK.PRICE_OK]: (draftMessageId) =>
		`✅ Баталгаажууллаа (draft message ${draftMessageId}): үнийг шинэчилнэ.`,
	[TELEGRAM_CALLBACK.PRICE_NO]: (draftMessageId) =>
		`❌ Цуцаллаа (draft message ${draftMessageId}): үнийн өөрчлөлт.`,
};

const formatShipAllResult = (
	result: Awaited<ReturnType<typeof shipAllPaidPendingOrders>>,
) => {
	const lines = ["📦 Илгээлтийн үр дүн", ""];
	if (result.shipped.length > 0) {
		lines.push(`Илгээгдсэн (${result.shipped.length}):`);
		lines.push(...result.shipped.map((n) => `• ${n}`));
	}
	if (result.skipped.length > 0) {
		if (result.shipped.length > 0) lines.push("");
		lines.push(`Алгассан (${result.skipped.length}):`);
		lines.push(
			...result.skipped.map((s) => `• ${s.orderNumber}: ${s.reason}`),
		);
	}
	if (result.shipped.length === 0 && result.skipped.length === 0) {
		lines.push("Илгээх төлбөртэй захиалга алга.");
	}
	return lines.join("\n");
};

const clearInlineButtons = async (
	api: Api,
	chatId: number,
	messageId: number,
) => {
	await api.editMessageReplyMarkup(chatId, messageId, {
		reply_markup: { inline_keyboard: [] },
	});
};

export async function handleTelegramCallback(input: {
	update: Update;
	env: TelegramWebhookEnv;
	channel: {
		conversationKey: (
			ref: ReturnType<typeof conversationFromMessage>,
		) => string;
	};
}) {
	const query = input.update.callback_query;
	if (!query?.message) return undefined;
	if (!isAdminUser(query.from.id, input.env)) return undefined;

	const token = input.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
	if (!token) return undefined;

	const api = new Api(token);
	await api.answerCallbackQuery(query.id);

	const data = query.data?.trim();
	if (!data) return undefined;

	const { action, messageId: boundMessageId } = parseTelegramCallbackData(data);
	const chatId = query.message.chat.id;
	const callbackMessageId = query.message.message_id;

	try {
		if (action === TELEGRAM_CALLBACK.SHIP_ALL) {
			if (boundMessageId === undefined) {
				await api.sendMessage(chatId, "Энэ товч хуучирсан байна.");
				return undefined;
			}
			if (boundMessageId !== callbackMessageId) {
				await api.sendMessage(chatId, "Энэ товч энэ мессежид хамаарахгүй.");
				return undefined;
			}

			const dedupeKey = `telegram:ship_all:v1:${chatId}:${boundMessageId}`;
			if (!(await claimInboundOnce(dedupeKey, input.env))) return undefined;

			const storeApiUrl = (
				input.env.STORE_API_URL ?? process.env.STORE_API_URL
			)?.trim();
			const botToken = (
				input.env.ADMIN_BOT_TOKEN ?? process.env.ADMIN_BOT_TOKEN
			)?.trim();
			if (!storeApiUrl || !botToken) {
				await releaseInboundClaim(dedupeKey, input.env);
				await api.sendMessage(
					chatId,
					"Илгээх тохиргоо дутуу байна (STORE_API_URL, ADMIN_BOT_TOKEN).",
				);
				return undefined;
			}

			const result = await shipAllPaidPendingOrders({
				storeApiUrl,
				botToken,
			});
			await clearInlineButtons(api, chatId, boundMessageId);
			await api.sendMessage(chatId, formatShipAllResult(result), {
				link_preview_options: { is_disabled: true },
			});
			return undefined;
		}

		const buildConfirmText = confirmMessages[action];
		if (
			buildConfirmText &&
			boundMessageId !== undefined &&
			query.message.chat.type === "private"
		) {
			if (boundMessageId !== callbackMessageId) {
				await api.sendMessage(chatId, "Энэ баталгаажуулалт хуучирсан байна.");
				return undefined;
			}

			const dedupeKey = `telegram:confirm:v1:${chatId}:${boundMessageId}:${action}`;
			if (!(await claimInboundOnce(dedupeKey, input.env))) return undefined;

			const sessionId = input.channel.conversationKey(
				conversationFromMessage(
					query.message as NonNullable<Update["message"]>,
				),
			);
			await clearInlineButtons(api, chatId, boundMessageId);
			await dispatch(adminAssistant, {
				id: sessionId,
				input: {
					type: "telegram.message",
					text: buildConfirmText(boundMessageId),
					updateId: input.update.update_id,
				},
			});
		}
	} catch (error) {
		throw error;
	}

	return undefined;
}
