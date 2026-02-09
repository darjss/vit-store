import { env } from "cloudflare:workers";
import { createLogger, createRequestContext } from "@vit/logger";
import type { PaymentWebhookResponse } from "@vit/shared";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// Bonum payment webhook
app.post("/bonum", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "system" });
	const log = createLogger(logContext);

	const body = await c.req.json<PaymentWebhookResponse>();
	log.info("BONUM WEBHOOK HEADERS", Object.fromEntries(c.req.raw.headers));
	log.webhook.received({
		provider: "bonum",
		eventType: "payment",
		payloadSize: JSON.stringify(body).length,
	});

	return c.json({ success: true });
});

export default app;
