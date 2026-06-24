import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";
import { channel as messengerChannel } from "../src/channels/messenger";

const app = new Hono();

for (const route of messengerChannel.routes) {
	if (route.method === "GET") {
		app.get(`/channels/messenger${route.path}`, route.handler as never);
	}
	if (route.method === "POST") {
		app.post(`/channels/messenger${route.path}`, route.handler as never);
	}
}

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
