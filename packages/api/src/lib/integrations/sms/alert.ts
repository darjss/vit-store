import { sendTelegramText } from "~/lib/integrations/admin-notifications/telegram";
import { kv } from "~/lib/kv";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";

const ALERT_THROTTLE_SECONDS = 30 * 60;

export async function alertSmsGatewayProblem(
	alert: { kind: "pending" } | { error: string; kind: "failed" },
) {
	try {
		const key = `sms:gateway-alert:${alert.kind}`;
		if (await kv().get(key)) {
			return;
		}
		await kv().put(key, "1", { expirationTtl: ALERT_THROTTLE_SECONDS });
		const text =
			alert.kind === "pending"
				? "⚠️ SMS gateway is not picking up messages\n\nA message is still Pending after 10 seconds, so the SMS Gateway app on the phone is probably closed or crashed. Open the app to resume sending.\n\nQueued messages expire on their own (OTPs after 5 min, other messages within 15 min), so nothing stale will go out."
				: `⚠️ SMS failed to send\n\nThe SMS Gateway app is running but a message failed: ${alert.error}\n\nCheck the phone's SIM balance and signal.`;
		await sendTelegramText(text);
	} catch (error) {
		logger.error("sms.gateway_alert_failed", parseCaught(error), { kind: alert.kind });
	}
}
