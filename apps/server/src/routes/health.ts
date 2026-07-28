import { Hono } from "hono";
import type { ServerHonoEnv } from "../lib/logging";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/health-check", (c) => {
	return c.json({ status: "good" });
});

export default app;
