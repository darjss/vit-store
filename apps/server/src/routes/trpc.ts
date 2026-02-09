import { trpcServer } from "@hono/trpc-server";
import { adminRouter, storeRouter } from "@vit/api";
import { createLogger } from "@vit/logger";
import { Hono } from "hono";
import { createContext } from "../lib/context";

const app = new Hono<{ Bindings: Env }>();

// Admin tRPC
app.use(
	"/admin/*",
	trpcServer({
		endpoint: "/trpc/admin",
		router: adminRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error }) {
			const log = createLogger({
				requestId: crypto.randomUUID(),
				userType: "admin",
			});
			log.error("trpc.admin_error", error, {
				path,
				code: error.code,
			});
		},
	}),
);

// Store tRPC
app.use(
	"/store/*",
	trpcServer({
		endpoint: "/trpc/store",
		router: storeRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error }) {
			const log = createLogger({
				requestId: crypto.randomUUID(),
				userType: "customer",
			});
			log.error("trpc.store_error", error, {
				path,
				code: error.code,
			});
		},
	}),
);

export default app;
