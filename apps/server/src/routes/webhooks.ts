import type { GenericWebhookPayload } from "@vit/api/integrations";
import { messengerWebhookHandler } from "@vit/api/integrations";
import { Hono } from "hono";
import * as v from "valibot";
import type { ServerHonoEnv } from "../lib/logging";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const messengerWebhookPayloadSchema = v.custom<GenericWebhookPayload>(
	(value) => {
		if (!isRecord(value) || value.object !== "page") return false;
		if (!Array.isArray(value.entry)) return false;
		return value.entry.every((entry) => {
			if (!isRecord(entry)) return false;
			if (typeof entry.id !== "string" || typeof entry.time !== "number") {
				return false;
			}
			if (entry.messaging === undefined) return true;
			if (!Array.isArray(entry.messaging)) return false;
			return entry.messaging.every((event) => {
				if (!isRecord(event)) return false;
				if (event.postback !== undefined) {
					return (
						isRecord(event.postback) &&
						typeof event.postback.payload === "string"
					);
				}
				return true;
			});
		});
	},
	"Invalid Messenger webhook payload.",
);

app.post("/messenger", async (c) => {
	const log = c.get("log");
	log.set({ user_type: "system", operation: "messenger.webhook.legacy" });
	let wire: unknown;
	try {
		wire = await c.req.json();
	} catch {
		return c.json({ error: "invalid_payload" }, 400);
	}
	const payload = v.safeParse(messengerWebhookPayloadSchema, wire);
	if (!payload.success) {
		log.warn("webhook.invalid", { provider: "messenger" });
		return c.json({ error: "invalid_payload" }, 400);
	}
	const result = await messengerWebhookHandler(payload.output);
	if (result.status === "error") {
		log.warn("webhook.invalid", {
			provider: "messenger",
			error_tag: result.error._tag,
			code: result.error.code,
		});
	} else {
		log.info("webhook.processed", { provider: "messenger" });
	}
	return c.text("OK", 200);
});

app.get("/messenger", (c) => {
	const log = c.get("log");
	log.set({ user_type: "system", operation: "messenger.webhook.verify" });
	const mode = c.req.query("hub.mode");
	const verifyToken = c.req.query("hub.verify_token");
	const challenge = c.req.query("hub.challenge");
	if (!mode || !verifyToken || !challenge) {
		log.warn("messenger.webhook_verify_failed", { reason: "missing_params" });
		return c.text("Invalid request", 400);
	}
	if (mode === "subscribe" && verifyToken === c.env.MESSENGER_VERIFY_TOKEN) {
		log.info("messenger.webhook_verified");
		return c.text(challenge, 200);
	}
	log.warn("messenger.webhook_verify_failed", { reason: "invalid_token" });
	return c.text("Invalid verify token", 403);
});

export default app;
