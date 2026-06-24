import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";

const app = new Hono();

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

app.route("/", flue());

export default app;
