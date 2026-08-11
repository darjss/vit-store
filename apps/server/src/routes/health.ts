import { Hono } from "hono";

const app: Hono<{ Bindings: Env }> = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/health-check", (c) => {
	return c.json({ status: "good" });
});

export default app;
