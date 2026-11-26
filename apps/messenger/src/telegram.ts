import type { Env } from "./env";
import { humanReasonLabel } from "./ops";

export type TelegramInlineButton = { callback_data: string; text: string };

type TelegramSendBody = {
	chat_id: string;
	link_preview_options: { is_disabled: boolean };
	reply_markup?: { inline_keyboard: Array<Array<TelegramInlineButton>> };
	text: string;
};

const sendToAdmins = async (
	env: Env,
	text: string,
	inlineKeyboard?: Array<Array<TelegramInlineButton>>,
): Promise<{ ok: boolean; status?: number }> => {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN;
	const chatIds = (env.TELEGRAM_ADMIN_CHAT_ID ?? "")
		.split(/[,\s]+/)
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	if (!token || chatIds.length === 0) {
		return { ok: false };
	}
	const base = (env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
	const statuses = await Promise.all(
		chatIds.map(async (chatId) => {
			const body: TelegramSendBody = {
				chat_id: chatId,
				link_preview_options: { is_disabled: true },
				text,
			};
			if (inlineKeyboard !== undefined) {
				body.reply_markup = { inline_keyboard: inlineKeyboard };
			}
			const response = await fetch(`${base}/bot${encodeURIComponent(token)}/sendMessage`, {
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			return response.status;
		}),
	);
	const failed = statuses.find((s) => s < 200 || s >= 300);
	return { ok: failed === undefined, status: failed ?? statuses[0] };
};

const conversationIdFromThread = (threadId: string): string => {
	const parts = threadId.split(":");
	return parts.at(-1) ?? threadId;
};

// Plain Mongolian operational ping (auto-paid, dispatch notice, packer updates, daily digest).
export const sendTelegramOpsNote = async (
	env: Env,
	text: string,
	inlineKeyboard?: Array<Array<TelegramInlineButton>>,
): Promise<{ ok: boolean; status?: number }> => sendToAdmins(env, text, inlineKeyboard);

// One-shot admin alert to every chat in TELEGRAM_ADMIN_CHAT_ID.
export const sendTelegramAlert = async (
	env: Env,
	input: {
		customerName?: string;
		extraLines?: Array<string>;
		reason: string;
		recentTexts: Array<string>;
		tag?: "handoff" | "payment";
		threadId: string;
	},
): Promise<{ ok: boolean; status?: number }> => {
	const tag = input.tag ?? "handoff";
	const header = tag === "payment" ? "💳 Төлбөрийн мэдэгдэл" : "🔴 Ээжийн хариу хэрэгтэй";
	const who = input.customerName?.trim() || "Нэр тодорхойгүй";
	const lines = [
		header,
		`👤 ${who}`,
		`📌 ${humanReasonLabel(input.reason)}`,
		...(input.extraLines ?? []),
		...input.recentTexts
			.slice(0, 5)
			.reverse()
			.map((t) => `> ${t}`),
	];
	const convId = conversationIdFromThread(input.threadId);
	const buttons =
		tag === "handoff" && convId.length > 0 && convId.length <= 50
			? [[{ callback_data: `resume:${convId}`, text: "✅ Хариулсан · Бот асаах" }]]
			: undefined;
	return sendToAdmins(env, lines.join("\n"), buttons);
};

// Ops nudge when a delivered/unpaid order is past Meta's 23h messaging window:
// human admin can follow up once from Meta Inbox (HUMAN_AGENT, legal <= 7d).
export const sendTelegramOpsNudge = async (
	env: Env,
	input: {
		customerName?: string;
		orderNumber: string;
		phone: string;
		reason: string;
		threadId: string;
		total: number;
	},
): Promise<{ ok: boolean; status?: number }> => {
	const lines = [
		`⏰ Төлбөр сануулах (${input.reason})`,
		...(input.customerName ? [`👤 ${input.customerName}`] : []),
		`Захиалга: №${input.orderNumber} · ${Math.round(input.total).toLocaleString("en-US")}₮ · ${input.phone}`,
		"Meta Inbox дээр сануулга явуулна уу.",
	];
	return sendToAdmins(env, lines.join("\n"));
};
