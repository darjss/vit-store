import { trpcServer } from "@hono/trpc-server";
import { Redis } from "@upstash/redis";
import { adminRouter, storeRouter } from "@vit/api";
import { createDb } from "@vit/api/db";
import { ProductsTable } from "@vit/api/db/schema";
import { sendEmail, smsGateway } from "@vit/api/integrations";
import { createLogger, loggerMiddleware } from "@vit/logger";
import { and, eq, isNull } from "drizzle-orm";
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
const RESTOCK_WATCH_PRODUCTS_KEY = "restock:watch:products";

type RestockSubscription = {
	productId: number;
	channel: "sms" | "email";
	contact: string;
	createdAt: string;
};

const createRedisClient = (env: Env) => {
	return new Redis({
		url: env.UPSTASH_REDIS_REST_URL,
		token: env.UPSTASH_REDIS_REST_TOKEN,
	});
};

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

const runRestockNotifier = async (env: Env) => {
	const redis = createRedisClient(env);
	const watchedProducts =
		((await redis.smembers(RESTOCK_WATCH_PRODUCTS_KEY)) as string[]) ?? [];

	if (watchedProducts.length === 0) {
		return;
	}

	const directDbUrl = (env as any).DIRECT_DB_URL;
	const db =
		directDbUrl && directDbUrl.length > 0
			? createDb(directDbUrl)
			: createDb(env.DB);

	for (const productIdRaw of watchedProducts) {
		const productId = Number.parseInt(productIdRaw, 10);
		if (!Number.isFinite(productId) || productId <= 0) {
			await redis.srem(RESTOCK_WATCH_PRODUCTS_KEY, productIdRaw);
			continue;
		}

		const product = await db.query.ProductsTable.findFirst({
			columns: {
				id: true,
				name: true,
				stock: true,
				status: true,
			},
			where: and(
				eq(ProductsTable.id, productId),
				isNull(ProductsTable.deletedAt),
			),
		});

		if (!product) {
			await redis.srem(RESTOCK_WATCH_PRODUCTS_KEY, String(productId));
			continue;
		}

		if (product.stock === 0 || product.status === "out_of_stock") {
			continue;
		}

		const productSubscribersKey = `restock:subs:${productId}`;
		const subscriberIds =
			((await redis.smembers(productSubscribersKey)) as string[]) ?? [];

		if (subscriberIds.length === 0) {
			await redis.srem(RESTOCK_WATCH_PRODUCTS_KEY, String(productId));
			continue;
		}

		for (const subscriberId of subscriberIds) {
			const subscriberDataKey = `restock:sub:${productId}:${subscriberId}`;
			const payloadRaw = await redis.get<string>(subscriberDataKey);

			if (!payloadRaw) {
				await redis.srem(productSubscribersKey, subscriberId);
				continue;
			}

			let payload: RestockSubscription;
			try {
				payload = JSON.parse(payloadRaw) as RestockSubscription;
			} catch {
				await redis.del(subscriberDataKey);
				await redis.srem(productSubscribersKey, subscriberId);
				continue;
			}

			try {
				if (payload.channel === "sms") {
					const smsFinalState = await smsGateway.sendSmsAndWait({
						message: `${product.name} бараа дахин орлоо. Та vitstore-д захиалах боломжтой.`,
						phoneNumbers: [`+976${payload.contact}`],
					});

					if (smsFinalState.state === "Failed") {
						throw new Error(smsFinalState.recipients[0]?.error ?? "SMS failed");
					}
				} else {
					await sendEmail({
						to: payload.contact,
						subject: `${product.name} is back in stock`,
						text: `${product.name} is back in stock at Vit Store. You can place your order now.`,
					});
				}

				await redis.del(subscriberDataKey);
				await redis.srem(productSubscribersKey, subscriberId);
			} catch (error) {
				console.error("restock.notify_failed", {
					productId,
					subscriberId,
					error,
				});
			}
		}

		const remainingSubscribers =
			((await redis.smembers(productSubscribersKey)) as string[]) ?? [];
		if (remainingSubscribers.length === 0) {
			await redis.del(productSubscribersKey);
			await redis.srem(RESTOCK_WATCH_PRODUCTS_KEY, String(productId));
		}
	}
};

export default {
	fetch: app.fetch,
	scheduled: async (_controller: ScheduledController, env: Env) => {
		await runRestockNotifier(env);
	},
};
