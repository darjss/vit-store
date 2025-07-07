import { env } from "cloudflare:workers";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "./lib/context";
import { adminRouter } from "./routers/admin";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { storeRouter } from "./routers/store";

const app = new Hono();
console.log("cors origin", env.CORS_ORIGIN);
app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN || "",
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.use(
	"/trpc/admin/*",
	trpcServer({
		router: adminRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.use(
	"/trpc/store/*",
	trpcServer({
		router: storeRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
