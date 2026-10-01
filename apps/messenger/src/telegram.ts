import type { Env } from "./env";

// One-shot admin alert. Best effort: caller logs failures, nothing throws.
// Plain text only — no inline button: this worker has no Telegram webhook,
// and a callback would land on the old apps/agent bot.
export const sendTelegramAlert = async (
	env: Env,
	input: { reason: string; recentTexts: Array<string>; threadId: string },
): Promise<{ ok: boolean; status?: number }> => {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN;
	const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
	if (!token || !chatId) {
		return { ok: false };
	}
	const base = (env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
	const lines = [
		`[handoff] ${input.reason}`,
		`Thread: ${input.threadId}`,
		...input.recentTexts.slice(-5).map((t) => `> ${t}`),
		`Resume: POST /admin/conversations/${encodeURIComponent(input.threadId)}/resume`,
	];
	const response = await fetch(`${base}/bot${encodeURIComponent(token)}/sendMessage`, {
		body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
		headers: { "content-type": "application/json" },
		method: "POST",
	});
	return { ok: response.ok, status: response.status };
};
