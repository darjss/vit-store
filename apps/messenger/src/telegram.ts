import type { Env } from "./env";

// One-shot admin alert to every chat in TELEGRAM_ADMIN_CHAT_ID (the env value
// is a comma-separated allowlist). Best effort: caller logs failures,
// nothing throws. Plain text only — no inline button: the Resume path is the
// admin route.
export const sendTelegramAlert = async (
	env: Env,
	input: { reason: string; recentTexts: Array<string>; threadId: string },
): Promise<{ ok: boolean; status?: number }> => {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN;
	const chatIds = (env.TELEGRAM_ADMIN_CHAT_ID ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	if (!token || chatIds.length === 0) {
		return { ok: false };
	}
	const base = (env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
	// recentTexts is newest-first; show the newest five in chat order.
	const lines = [
		`[handoff] ${input.reason}`,
		`Thread: ${input.threadId}`,
		...input.recentTexts
			.slice(0, 5)
			.reverse()
			.map((t) => `> ${t}`),
		`Resume: POST /admin/conversations/${encodeURIComponent(input.threadId)}/resume`,
	];
	let lastStatus: number | undefined;
	for (const chatId of chatIds) {
		const response = await fetch(`${base}/bot${encodeURIComponent(token)}/sendMessage`, {
			body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		lastStatus = response.status;
		if (!response.ok) {
			return { ok: false, status: response.status };
		}
	}
	return { ok: true, status: lastStatus };
};
