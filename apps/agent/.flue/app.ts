import type { ChannelRoute } from "@flue/messenger";
import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";
import { channel as messengerChannel } from "../src/channels/messenger";
import {
	type PhotoProbeEnv,
	type PhotoProbeInput,
	runPhotoProbe,
} from "../src/lib/photo-probe";

// Explicit annotation: the isolated package layout makes Hono's inferred type
// reference a non-portable store path (TS2742), so name it with the imported
// base type to keep the default export portable.
const app: Hono = new Hono();

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
		note: "Inbound Messenger photos are fetched server-side, stored under this R2 prefix, and only the key is dispatched to the agent (#20, ADR 0003).",
	}),
);

// Live-proof harness for the #20 inbound-photo pipeline (stage -> Kimi vision ->
// suggested queries -> #19 search + cards). Not on the customer message path;
// requires the remote Workers AI binding. Driven by cli/photo-identify.ts.
app.post("/messenger/photo-probe", async (c) => {
	let input: PhotoProbeInput;
	try {
		input = (await c.req.json()) as PhotoProbeInput;
	} catch {
		return c.json({ error: "expected a JSON body { imageUrl }" }, 400);
	}
	if (typeof input.imageUrl !== "string" || input.imageUrl.length === 0) {
		return c.json({ error: "imageUrl is required" }, 400);
	}
	try {
		const result = await runPhotoProbe(c.env as PhotoProbeEnv, input);
		return c.json(result);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : String(error) },
			502,
		);
	}
});

app.route("/", flue() as never);

export default app;
