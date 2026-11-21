import {
	handleTuDeliveryWebhook,
	messengerWebhookHandler,
	messengerWebhookPayloadSchema,
	tuWebhookPayloadSchema,
	verifyTuPathToken,
	verifyTuWebhookSignature,
} from "@vit/api/integrations";
import { env } from "cloudflare:workers";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
import * as v from "valibot";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
app.post("/messenger", async (c) => {
	const log = c.get("log");
	log.set({ operation: "messenger.webhook", user_type: "system" });
	// Always ACK 200 so Meta does not retry forever. Invalid payloads and
	// handler failures are logged and dropped, matching pre-parse behavior.
	try {
		const payload = v.parse(messengerWebhookPayloadSchema, await c.req.json());
		log.info("webhook.received", {
			eventType: payload.object,
			provider: "messenger",
		});
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

app.post("/tu/:token", async (c) => {
	const log = c.get("log");
	log.set({ operation: "tu.webhook", user_type: "system" });

	const expectedToken = env.TU_WEBHOOK_TOKEN?.trim() ?? "";
	if (!verifyTuPathToken(c.req.param("token"), expectedToken)) {
		log.warn("tu.webhook_unauthorized", { reason: "invalid_token" });
		return c.text("Unauthorized", 401);
	}

	const rawBody = await c.req.text();
	const secret = env.TU_WEBHOOK_SECRET?.trim();
	if (secret) {
		const check = await verifyTuWebhookSignature({
			rawBody,
			secret,
			signatureHeader: c.req.header("x-signature") ?? null,
			timestampHeader: c.req.header("x-timestamp") ?? null,
		});
		if (!check.ok) {
			log.warn("tu.webhook_unauthorized", { reason: check.reason });
			return c.text("Unauthorized", 401);
		}
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(rawBody);
	} catch {
		log.warn("tu.webhook_invalid_json");
		return c.text("Bad Request", 400);
	}
	const parsed = v.safeParse(tuWebhookPayloadSchema, parsedJson);
	if (!parsed.success) {
		log.warn("tu.webhook_invalid_payload");
		return c.text("Bad Request", 400);
	}

	const result = await handleTuDeliveryWebhook(parsed.output);
	log.info("tu.webhook_processed", {
		action: result.action,
		orderId: result.orderId,
		orderNumber: result.orderNumber,
		tuOrderId: parsed.output.orderId,
		tuStatus: parsed.output.status,
	});
	return c.text("OK", 200);
});

export default app;
