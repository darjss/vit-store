import { trpcServer } from "@hono/trpc-server";
import {
	adminRouter,
	botRouter,
	finalizeCatalogCacheHeaders,
	storeRouter,
} from "@vit/api";
import { projectPanicForLog } from "@vit/shared";
import { Result } from "better-result";
import { createLogger } from "evlog";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createContext } from "./lib/context";
import { evlogMiddleware, type ServerHonoEnv } from "./lib/logging";
import { runPaymentNotificationOutbox } from "./lib/payment-notification-outbox";
import { rateLimit } from "./lib/rate-limit";
import { runRestockNotifier } from "./lib/restock-notifier";
import { logTrpcError } from "./lib/trpc-error-log";
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

type ScheduledJobFailure = {
	_tag: "ScheduledJobFailed";
	job: "restock_notifier" | "payment_notification_outbox";
};

const runScheduledJob = async (
	job: ScheduledJobFailure["job"],
	operation: Promise<unknown>,
) => {
	try {
		await operation;
		return Result.ok<void, ScheduledJobFailure>(undefined);
	} catch {
		return Result.err<void, ScheduledJobFailure>({
			_tag: "ScheduledJobFailed",
			job,
		});
	}
};

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

app.use(evlogMiddleware());

app.onError((_error, c) => {
	const correlationId = c.req.header("x-request-id") ?? crypto.randomUUID();
	c.get("log").error(new Error("Unhandled request defect."), {
		event: "http.unhandled_error",
		...projectPanicForLog(correlationId, {
			operation: "http.request",
			error_layer: "router",
		}),
	});
	return c.json(
		{
			error: {
				code: "internal_error",
				message: "Internal server error",
				correlationId,
			},
		},
		500,
	);
});

app.use("/*", (c, next) => {
	const rateLimitMiddleware = rateLimit({
		rateLimiter: () => c.env.RATE_LIMITER,
		getRateLimitKey: (c) => c.req.header("cf-connecting-ip"),
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
			if (ctx) logTrpcError(ctx.log, "trpc.admin_error", path, error);
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
			if (ctx) logTrpcError(ctx.log, "trpc.store_error", path, error);
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
			if (ctx) logTrpcError(ctx.log, "trpc.bot_error", path, error);
		},
	}),
);

app.route("/", healthRoutes);
app.route("/admin", authRoutes);
app.route("/upload", uploadRoutes);
app.route("/webhooks", paymentRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/admin", adminRoutes);

const worker: ExportedHandler<Env> = {
	fetch: (request, env, executionCtx) => app.fetch(request, env, executionCtx),
	scheduled: async (_controller, env) => {
		const log = createLogger({
			operation: "scheduled.jobs",
			request_id: crypto.randomUUID(),
			user_type: "system",
		});
		const [restock, paymentNotifications] = await Promise.all([
			runScheduledJob("restock_notifier", runRestockNotifier(env)),
			runScheduledJob(
				"payment_notification_outbox",
				runPaymentNotificationOutbox(),
			),
		]);
		const failures = [restock, paymentNotifications].flatMap((result) =>
			result.status === "error" ? [result.error] : [],
		);
		const jobs = {
			restock_notifier: restock.status === "ok" ? "fulfilled" : "rejected",
			payment_notification_outbox:
				paymentNotifications.status === "ok" ? "fulfilled" : "rejected",
		};

		if (failures.length > 0) {
			log.error(new Error("Scheduled jobs failed."), {
				event: "scheduled.jobs_complete",
				jobs,
				failures,
			});
			log.emit();
			throw new Error(
				`Scheduled jobs failed: ${failures.map(({ job }) => job).join(", ")}`,
			);
		}

		log.info("scheduled.jobs_complete", { jobs });
		log.emit();
	},
};

export default worker;
