import { env } from "cloudflare:workers";
import type { GenericWebhookPayload } from "@vit/api/integrations";
import { messengerWebhookHandler } from "@vit/api/integrations";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
app.post("/messenger", async (c) => {
	const log = c.get("log");
	log.set({ operation: "messenger.webhook", user_type: "system" });
	const payload = (await c.req.json()) as GenericWebhookPayload;
	log.info("webhook.received", {
		eventType: payload.object,
		provider: "messenger",
	});
	try {
		await messengerWebhookHandler(payload);
		log.info("webhook.processed", { provider: "messenger", success: true });
	} catch (error) {
		log.error("webhook.failed", {
			error: String(error),
			event: "webhook.failed",
			provider: "messenger",
		});
	}
	return c.text("OK", 200);
});
app.get("/messenger", async (c) => {
	const log = c.get("log");
	log.set({ operation: "messenger.webhook.verify", user_type: "system" });
	const mode = c.req.query("hub.mode");
	const verifyToken = c.req.query("hub.verify_token");
	const challenge = c.req.query("hub.challenge");
	if (mode && verifyToken && challenge) {
		if (mode === "subscribe" && verifyToken === env.MESSENGER_VERIFY_TOKEN) {
			log.info("messenger.webhook_verified");
			return c.text(challenge, 200);
		}
		log.warn("messenger.webhook_verify_failed", { reason: "invalid_token" });
		return c.text("Invalid verify token", 403);
	}
	log.warn("messenger.webhook_verify_failed", { reason: "missing_params" });
	return c.text("Invalid request", 400);
});
export default app;
