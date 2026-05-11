import { env } from "cloudflare:workers";
import type { GenericWebhookPayload } from "@vit/api/integrations";
import { messengerWebhookHandler } from "@vit/api/integrations";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
const app = new Hono<ServerHonoEnv>();
app.post("/messenger", async (c) => {
    const log = c.get("log");
    log.set({ user_type: "system", operation: "messenger.webhook" });
    const payload = (await c.req.json()) as GenericWebhookPayload;
    log.info("webhook.received", {
        provider: "messenger",
        eventType: payload.object,
    });
    try {
        await messengerWebhookHandler(payload);
        log.info("webhook.processed", { provider: "messenger", success: true });
    }
    catch (e) {
        log.error("webhook.failed", {
            event: "webhook.failed",
            provider: "messenger", error: String(e)
        });
    }
    return c.text("OK", 200);
});
app.get("/messenger", async (c) => {
    const log = c.get("log");
    log.set({ user_type: "system", operation: "messenger.webhook.verify" });
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
