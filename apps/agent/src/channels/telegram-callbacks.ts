import { Api } from "grammy";
import type { Update } from "@flue/telegram";
import { dispatch } from "@flue/runtime";
import adminAssistant from "../agents/admin-assistant";
import { shipAllPaidPendingOrders } from "../lib/ship-paid-orders";
import {
	claimInboundOnce,
	releaseInboundClaim,
} from "./messenger-admission";
import {
	conversationFromMessage,
	isAdminUser,
	type TelegramWebhookEnv,
} from "./telegram";

export const TELEGRAM_CALLBACK = {
	SHIP_ALL: "ship_all",
	STOCK_OK: "stock_ok",
	STOCK_NO: "stock_no",
	PRICE_OK: "price_ok",
	PRICE_NO: "price_no",
} as const;

const confirmMessages: Record<string, string> = {
	[TELEGRAM_CALLBACK.STOCK_OK]:
		"✅ Баталгаажууллаа: нөөц шинэчлэлийг хэрэгжүүлнэ.",
	[TELEGRAM_CALLBACK.STOCK_NO]: "❌ Цуцаллаа: нөөц шинэчлэл.",
	[TELEGRAM_CALLBACK.PRICE_OK]:
		"✅ Баталгаажууллаа: үнийг шинэчилнэ.",
	[TELEGRAM_CALLBACK.PRICE_NO]: "❌ Цуцаллаа: үнийн өөрчлөлт.",
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

	const dedupeKey = `telegram:callback:v1:${input.update.update_id}`;
	if (!(await claimInboundOnce(dedupeKey, input.env))) return undefined;

	const chatId = query.message.chat.id;

	try {
		if (data === TELEGRAM_CALLBACK.SHIP_ALL) {
			const storeApiUrl = (
				input.env.STORE_API_URL ?? process.env.STORE_API_URL
			)?.trim();
			const botToken = (
				input.env.ADMIN_BOT_TOKEN ?? process.env.ADMIN_BOT_TOKEN
			)?.trim();
			if (!storeApiUrl || !botToken) {
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
			await api.sendMessage(chatId, formatShipAllResult(result), {
				link_preview_options: { is_disabled: true },
			});
			return undefined;
		}

		const confirmText = confirmMessages[data];
		if (confirmText && query.message.chat.type === "private") {
			const sessionId = input.channel.conversationKey(
				conversationFromMessage(
					query.message as NonNullable<Update["message"]>,
				),
			);
			await dispatch(adminAssistant, {
				id: sessionId,
				input: {
					type: "telegram.message",
					text: confirmText,
					updateId: input.update.update_id,
				},
			});
		}
	} catch (error) {
		await releaseInboundClaim(dedupeKey, input.env);
		throw error;
	}

	return undefined;
}
