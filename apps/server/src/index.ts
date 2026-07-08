import { trpcServer } from "@hono/trpc-server";
import {
	adminRouter,
	botRouter,
	finalizeCatalogCacheHeaders,
	storeRouter,
} from "@vit/api";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createContext } from "./lib/context";
import { evlogMiddleware, type ServerHonoEnv } from "./lib/logging";
import { rateLimit } from "./lib/rate-limit";
import { runRestockNotifier } from "./lib/restock-notifier";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import paymentRoutes from "./routes/payments";
import uploadRoutes from "./routes/uploads";
import webhookRoutes from "./routes/webhooks";

export { ProductSearchObject } from "./durable-objects/product-search-object";
export { TransferReconciliationObject } from "./durable-objects/transfer-reconciliation-object";

const DEFAULT_CORS_ORIGINS = [
	"http://localhost:5173",
	"https://admin.vitstore.dev",
];

const app = new Hono<ServerHonoEnv>();

app.use(evlogMiddleware());

app.use("/*", (c, next) => {
	const rateLimitMiddleware = rateLimit({
		rateLimiter: () => c.env.RATE_LIMITER,
		getRateLimitKey: (c) => c.req.header("cf-connecting-ip") ?? "unknown",
	});
	return rateLimitMiddleware(c, next);
});

app.use("/*", (c, next) => {
	const corsMiddleware = cors({
		origin: c.env.CORS_ORIGIN
			? c.env.CORS_ORIGIN.split(",")
			: DEFAULT_CORS_ORIGINS,
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
	});
	return corsMiddleware(c, next);
});

app.use(
	"/trpc/admin/*",
	trpcServer({
		endpoint: "/trpc/admin",
		router: adminRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error, ctx }) {
			ctx?.log.error(error, {
				event: "trpc.admin_error",
				trpc: { path, code: error.code, user_type: "admin" },
			});
		},
	}),
);

// Only the store surface gets finalizeCatalogCacheHeaders because it is the
// only public, unauthenticated catalog read path. Admin (/trpc/admin) carries
// an auth cookie → Workers Cache auto-bypasses, so tagging is pointless. Bot
// (/trpc/bot) uses the same resolvers as admin with a token header → also
// auto-bypassed. Finalizing only store avoids stamping no-store on admin/bot
// responses unnecessarily while ensuring catalog GETs get Cache-Tag/Cache-Control.
app.use("/trpc/store/*", async (c, next) => {
	await next();
	finalizeCatalogCacheHeaders(c);
});

app.use(
	"/trpc/store/*",
	trpcServer({
		endpoint: "/trpc/store",
		router: storeRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error, ctx }) {
			ctx?.log.error(error, {
				event: "trpc.store_error",
				trpc: { path, code: error.code, user_type: "customer" },
			});
		},
	}),
);

// Bot-facing tRPC surface: token-authed (X-Admin-Bot-Token) for the admin
// Messenger agent Worker. Same resolvers as /trpc/admin, different auth gate.
app.use(
	"/trpc/bot/*",
	trpcServer({
		endpoint: "/trpc/bot",
		router: botRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error, ctx }) {
			ctx?.log.error(error, {
				event: "trpc.bot_error",
				trpc: { path, code: error.code, user_type: "bot" },
			});
		},
	}),
);

app.route("/", healthRoutes);
app.route("/admin", authRoutes);
app.route("/upload", uploadRoutes);
app.route("/webhooks", paymentRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/admin", adminRoutes);

export default {
	fetch: app.fetch,
	scheduled: async (_controller: ScheduledController, env: Env) => {
		await runRestockNotifier(env);
	},
};
