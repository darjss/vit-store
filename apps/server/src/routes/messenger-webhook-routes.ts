import {
	createMessengerChannel,
	type MessengerChannel,
	type MessengerWebhookPayload,
} from "@flue/messenger";
import { Hono, type Handler } from "hono";
import type { ServerHonoEnv } from "../lib/logging";

type WebhookHandler = (
	payload: MessengerWebhookPayload,
) => Promise<
	| { status: "ok" }
	| { status: "error"; error: { _tag: string; code: string } }
>;

export const createMessengerWebhookRoutes = (handleWebhook: WebhookHandler) => {
	const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
	const channels = new WeakMap<object, MessengerChannel<ServerHonoEnv>>();

	const channelFor = (env: Env) => {
		const cached = channels.get(env);
		if (cached) return cached;

		const channel = createMessengerChannel<ServerHonoEnv>({
			appSecret: env.MESSENGER_APP_SECRET,
			verifyToken: env.MESSENGER_VERIFY_TOKEN,
			pageId: env.MESSENGER_PAGE_ID,
			async webhook({ c, payload }) {
				const log = c.get("log");
				log.set({ user_type: "system", operation: "messenger.webhook.legacy" });
				const result = await handleWebhook(payload);
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
			},
		});
		channels.set(env, channel);
		return channel;
	};

	const runChannelRoute = (
		method: "GET" | "POST",
	): Handler<ServerHonoEnv> =>
		async (c, next) => {
			const route = channelFor(c.env).routes.find(
				(candidate) => candidate.method === method,
			);
			if (!route) return next();
			// Flue pins its own Hono types. The runtime contexts are compatible.
			return route.handler(c as never, next as never);
		};

	app.get("/messenger", runChannelRoute("GET"));
	app.post("/messenger", runChannelRoute("POST"));
	return app;
};
