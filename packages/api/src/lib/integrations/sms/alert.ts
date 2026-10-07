import { sendTelegramText } from "~/lib/integrations/admin-notifications/telegram";
import { kv } from "~/lib/kv";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";

const ALERT_THROTTLE_SECONDS = 30 * 60;
const ALERT_DELIVERY_TIMEOUT_MS = 5000;

export async function alertSmsGatewayProblem(
	alert: { kind: "pending" } | { error: string; kind: "failed" },
) {
	const key = `sms:gateway-alert:${alert.kind}`;
	try {
		if (await kv().get(key)) {
			return;
		}
		await kv().put(key, "1", { expirationTtl: ALERT_THROTTLE_SECONDS });
		const text =
			alert.kind === "pending"
				? "⚠️ SMS gateway is not picking up messages\n\nA message is still Pending after 10 seconds, so the SMS Gateway app on the phone is probably closed or crashed. Open the app to resume sending.\n\nQueued messages expire on their own (OTPs after 5 min, other messages within 15 min), so nothing stale will go out."
				: `⚠️ SMS failed to send\n\nThe SMS Gateway app is running but a message failed: ${alert.error}\n\nCheck the phone's SIM balance and signal.`;
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
			logger.error("sms.gateway_alert_failed", parseCaught(deleteError), {
				kind: alert.kind,
			});
		}
		logger.error("sms.gateway_alert_failed", parseCaught(error), { kind: alert.kind });
	}
}
