import { trpcServer } from "@hono/trpc-server";
import { adminRouter, storeRouter } from "@vit/api";
import { createLogger, loggerMiddleware } from "@vit/logger";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createContext } from "./lib/context";
import { rateLimit } from "./lib/rate-limit";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import paymentRoutes from "./routes/payments";
import uploadRoutes from "./routes/uploads";
import webhookRoutes from "./routes/webhooks";

const DEFAULT_CORS_ORIGINS = [
	"http://localhost:5173",
	"https://admin.vitstore.dev",
];

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use(
	loggerMiddleware({
		excludePaths: ["/health-check", "/favicon.ico", "/"],
		logRequestStart: true,
		logRequestEnd: true,
	}),
);

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

// tPC routers
app.use(
	"/trpc/admin/*",
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

app.use(
	"/trpc/store/*",
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

// Route mounting
app.route("/", healthRoutes);
app.route("/admin", authRoutes);
app.route("/upload", uploadRoutes);
app.route("/webhooks", paymentRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/admin", adminRoutes);

export default app;
