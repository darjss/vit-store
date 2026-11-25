import type { Env } from "./env";

const sendToAdmins = async (env: Env, text: string): Promise<{ ok: boolean; status?: number }> => {
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN;
	const chatIds = (env.TELEGRAM_ADMIN_CHAT_ID ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	if (!token || chatIds.length === 0) {
		return { ok: false };
	}
	const base = (env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
	const statuses = await Promise.all(
		chatIds.map(async (chatId) => {
			const response = await fetch(`${base}/bot${encodeURIComponent(token)}/sendMessage`, {
				body: JSON.stringify({ chat_id: chatId, text }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			return response.status;
		}),
	);
	const failed = statuses.find((s) => s < 200 || s >= 300);
	return { ok: failed === undefined, status: failed ?? statuses[0] };
};

// One-shot admin handoff alert to every chat in TELEGRAM_ADMIN_CHAT_ID.
export const sendTelegramAlert = async (
	env: Env,
	input: {
		extraLines?: Array<string>;
		reason: string;
		recentTexts: Array<string>;
		threadId: string;
	},
): Promise<{ ok: boolean; status?: number }> => {
	const lines = [
		`[handoff] ${input.reason}`,
		`Thread: ${input.threadId}`,
		...(input.extraLines ?? []),
		...input.recentTexts
			.slice(0, 5)
			.reverse()
			.map((t) => `> ${t}`),
		`Resume: POST /admin/conversations/${encodeURIComponent(input.threadId)}/resume`,
	];
	return sendToAdmins(env, lines.join("\n"));
};

// Ops nudge when a delivered/unpaid order is past Meta's 23h messaging window:
// human admin can follow up once from Meta Inbox (HUMAN_AGENT, legal <= 7d).
export const sendTelegramOpsNudge = async (
	env: Env,
	input: {
		orderNumber: string;
		phone: string;
		reason: string;
		threadId: string;
		total: number;
	},
): Promise<{ ok: boolean; status?: number }> => {
	const lines = [
		`[unpaid] ${input.reason}`,
		`Order: #${input.orderNumber} · ${Math.round(input.total).toLocaleString("en-US")}₮ · ${input.phone}`,
		`Thread: ${input.threadId}`,
		"Meta Inbox (HUMAN_AGENT) дээр сануулга явуулна уу.",
	];
	return sendToAdmins(env, lines.join("\n"));
};
