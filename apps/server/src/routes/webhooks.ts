import { env } from "cloudflare:workers";
import type { GenericWebhookPayload } from "@vit/api/integrations";
import { messenger, messengerWebhookHandler } from "@vit/api/integrations";
import { sendTransferNotification } from "@vit/api/lib/integrations/messenger/messages";
import { createLogger, createRequestContext } from "@vit/logger";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// POST /webhooks/messenger
app.post("/messenger", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "system" });
	const log = createLogger(logContext);

	const payload = (await c.req.json()) as GenericWebhookPayload;

	log.webhook.received({
		provider: "messenger",
		eventType: payload.object,
	});

	try {
		await messengerWebhookHandler(payload);
		log.webhook.processed({ provider: "messenger", success: true });
	} catch (e) {
		log.webhook.failed({ provider: "messenger", error: String(e) });
	}

	return c.text("OK", 200);
});

// GET /webhooks/messenger (verification)
app.get("/messenger", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "system" });
	const log = createLogger(logContext);

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

// Test endpoints (can be moved to separate test routes later)
app.get("/messenger/test", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);

	log.info("messenger.test_message_sent");

	const result = await messenger.send.message({
		messaging_type: "RESPONSE",
		recipient: { id: "25172502442390308" },
		message: { text: "Hello from Vit Store Messenger SDK!" },
	});

	return c.json(result);
});

app.get("/messenger/test/transfer", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);

	log.info("messenger.test_transfer_notification");

	await sendTransferNotification("1234567890", 10000);
	return c.json({ message: "Message sent" });
});

export default app;
