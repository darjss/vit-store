import { sendTelegramText } from "~/lib/integrations/admin-notifications/telegram";
import { kv } from "~/lib/kv";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";

const ALERT_DELIVERY_TIMEOUT_MS = 5000;
const BLOCKER_THROTTLE_SECONDS = 30 * 60;
const LOW_BALANCE_THROTTLE_SECONDS = 12 * 60 * 60;
const WESEND_DASHBOARD_URL = "https://wesend.mn/dashboard";

export type SmsAlert =
	| { balance: number; kind: "low_balance" }
	| { balance?: number; kind: "insufficient_credits"; required?: number }
	| { code: string; kind: "account_blocked" };

function formatAlertText(alert: SmsAlert) {
	switch (alert.kind) {
		case "low_balance": {
			return `⚠️ WeSend SMS balance is low: ${alert.balance.toLocaleString("en-US")}₮ left.\n\nTop up credits at ${WESEND_DASHBOARD_URL}`;
		}
		case "insufficient_credits": {
			const detail =
				alert.balance !== undefined && alert.required !== undefined
					? ` (${alert.balance.toLocaleString("en-US")}₮ left, need ${alert.required.toLocaleString("en-US")}₮)`
					: "";
			return `⚠️ WeSend SMS failed: insufficient credits${detail}.\n\nTop up at ${WESEND_DASHBOARD_URL} to resume sending.`;
		}
		case "account_blocked": {
			return `⚠️ WeSend SMS is blocked (${alert.code}).\n\nCheck project status and API key at ${WESEND_DASHBOARD_URL}`;
		}
	}
}

export async function alertSmsProblem(alert: SmsAlert) {
	const key =
		alert.kind === "account_blocked"
			? `sms:wesend-alert:${alert.kind}:${alert.code}`
			: `sms:wesend-alert:${alert.kind}`;
	const throttleSeconds =
		alert.kind === "low_balance" ? LOW_BALANCE_THROTTLE_SECONDS : BLOCKER_THROTTLE_SECONDS;

	try {
		if (await kv().get(key)) {
			return;
		}
		await kv().put(key, "1", { expirationTtl: throttleSeconds });
		const text = formatAlertText(alert);
		let timer: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			sendTelegramText(text),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("telegram_alert_timeout")),
					ALERT_DELIVERY_TIMEOUT_MS,
				);
			}),
		]).finally(() => clearTimeout(timer));
	} catch (error) {
		try {
			await kv().delete(key);
		} catch (deleteError) {
			logger.error("sms.alert_failed", parseCaught(deleteError), {
				kind: alert.kind,
			});
		}
		logger.error("sms.alert_failed", parseCaught(error), { kind: alert.kind });
	}
}
