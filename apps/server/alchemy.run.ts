import path from "node:path";
import alchemy from "alchemy";
import {
	D1Database,
	DurableObjectNamespace,
	Images,
	KVNamespace,
	R2Bucket,
	RateLimit,
	Worker,
} from "alchemy/cloudflare";
import { createServerAlchemyEnv } from "../../env";

const app = await alchemy("server");
const stage = app.stage;

const env = createServerAlchemyEnv(process.env);

const kv = await KVNamespace("kv", {
	title: `vit-kv-${app.stage}`,
	adopt: true,
});

const r2 = await R2Bucket("r2", {
	name: "vit-store-bucket-prod",
	dev: {
		remote: true,
	},
	adopt: true,
});

const rateLimit = RateLimit({
	namespace_id: 1001,
	simple: {
		limit: 1000,
		period: 60,
	},
});

const images = Images({
	dev: {
		remote: true,
	},
});

const productSearch = DurableObjectNamespace("product-search", {
	className: "ProductSearchObject",
	sqlite: true,
});

const transferReconciliation = DurableObjectNamespace(
	"transfer-reconciliation",
	{
		className: "TransferReconciliationObject",
		sqlite: true,
	},
);

const db = await D1Database("db", {
	name: `vit-d1-${stage}`,
	adopt: true,
	// Read replicas serve queries from the POP nearest the user instead of a
	// single origin; combined with dropping Worker `placement` below this is the
	// core latency win over Hyperdrive/Planetscale.
	readReplication: { mode: "auto" },
	primaryLocationHint: "apac",
	migrationsDir: path.join(
		import.meta.dirname,
		"..",
		"..",
		"packages",
		"api",
		"src",
		"db",
		"migrations",
	),
});

export const server = await Worker("api", {
	entrypoint: path.join(import.meta.dirname, "src", "index.ts"),
	compatibility: "node",
	// Cloudflare cron is UTC; 03:00 UTC = 11:00 Ulaanbaatar (UTC+8)
	crons: ["0 3 * * *"],
	domains: stage === "prod" ? ["api.amerikvitamin.mn"] : undefined,

	adopt: true,
	bindings: {
		PRODUCT_SEARCH: productSearch,
		KHAAN_TRANSFER_RECONCILER: transferReconciliation,
		RATE_LIMITER: rateLimit,
		DB: db,
		vitStoreKV: kv,
		r2Bucket: r2,
		images: images,
		CORS_ORIGIN: env.CORS_ORIGIN,
		DASH_URL: env.DASH_URL,
		GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
		GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL,
		DOMAIN: env.DOMAIN,
		MESSENGER_ACCESS_TOKEN: env.MESSENGER_ACCESS_TOKEN,
		MESSENGER_VERIFY_TOKEN: env.MESSENGER_VERIFY_TOKEN,
		SMS_GATEWAY_LOGIN: env.SMS_GATEWAY_LOGIN,
		SMS_GATEWAY_PASSWORD: env.SMS_GATEWAY_PASSWORD,
		RESEND_API_KEY: env.RESEND_API_KEY,
		RESTOCK_FROM_EMAIL: env.RESTOCK_FROM_EMAIL,
		FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY,
		OPENCODE_GO_API_KEY: env.OPENCODE_GO_API_KEY,
		UPSTASH_SEARCH_URL: env.UPSTASH_SEARCH_URL,
		UPSTASH_SEARCH_TOKEN: env.UPSTASH_SEARCH_TOKEN,
		UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
		QPAY_URL: env.QPAY_URL,
		QPAY_USERNAME: env.QPAY_USERNAME,
		QPAY_PASSWORD: env.QPAY_PASSWORD,
		QPAY_CALLBACK_URL: env.QPAY_CALLBACK_URL ?? env.GOOGLE_CALLBACK_URL,
		KHAAN_USERNAME: env.KHAAN_USERNAME,
		KHAAN_PASSWORD: env.KHAAN_PASSWORD,
		KHAAN_DEVICE_ID: env.KHAAN_DEVICE_ID,
		...(env.KHAAN_USER_AGENT ? { KHAAN_USER_AGENT: env.KHAAN_USER_AGENT } : {}),
		KHAAN_ACCOUNT_NUMBER: env.KHAAN_ACCOUNT_NUMBER,
		KHAAN_BRANCH_CODE: env.KHAAN_BRANCH_CODE,
		POSTHOG_PERSONAL_API_KEY: env.POSTHOG_API_KEY,
		POSTHOG_PROJECT_API_KEY: env.POSTHOG_PROJECT_API_KEY,
		POSTHOG_PROJECT_ID: env.POSTHOG_PROJECT_ID,
		POSTHOG_HOST: env.POSTHOG_HOST,
		DELIVERY_API_URL: env.DELIVERY_API_URL,
		DELIVERY_USERNAME: env.DELIVERY_USERNAME,
		DELIVERY_PASSWORD: env.DELIVERY_PASSWORD,
		DELIVERY_SENDERID: env.DELIVERY_SENDERID,
		...(env.ADMIN_BOT_TOKEN ? { ADMIN_BOT_TOKEN: env.ADMIN_BOT_TOKEN } : {}),
	},

	observability: {
		enabled: true,
		logs: {
			enabled: true,
			persist: true,
			destinations: ["axiom-logs"],
		},
	},
	// No `placement` pin: with D1 read replicas the Worker runs at the edge POP
	// nearest the user (was pinned to aws:ap-southeast-1 for Hyperdrive).
	dev: {
		port: 3006,
	},
});

await app.finalize();
