import type { ChannelRoute } from "@flue/messenger";
import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";
import { channel as messengerChannel } from "../src/channels/messenger";

const app = new Hono();

function mountChannel(
	hono: Hono,
	prefix: string,
	channel: { routes: readonly ChannelRoute[] },
): void {
	for (const route of channel.routes) {
		// Single bridge cast: the channel ships its own pinned Hono copy, so its
		// Handler is structurally distinct from this app's Hono Handler.
		hono.on(route.method, `${prefix}${route.path}`, route.handler as never);
	}
}

mountChannel(app, "/channels/messenger", messengerChannel);

app.get("/health", (c) =>
	c.json({
		ok: true,
		app: "vit-store-agent",
		model: "cloudflare/@cf/moonshotai/kimi-k2.6",
	}),
);

app.get("/messenger/inbound-r2-shape", (c) =>
	c.json({
		bucketBinding: "MESSENGER_INBOUND_BUCKET",
		prefix: "messenger-inbound/",
		note: "Later slices fetch Meta CDN photos, store R2 objects here, and pass only keys to the agent.",
	}),
);

app.route("/", flue() as never);

export default app;
