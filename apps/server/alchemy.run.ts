import path from "node:path";
import alchemy from "alchemy";
import {
	Hyperdrive,
	Images,
	KVNamespace,
	R2Bucket,
	RateLimit,
	Worker,
} from "alchemy/cloudflare";

const app = await alchemy("server");
const stage = app.stage;

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
		limit: 500,
		period: 60,
	},
});

const images = Images({
	dev: {
		remote: true,
	},
});

const hyperdriveDB = await Hyperdrive("pscale-db", {
	origin: {
		host: process.env.PLANETSCALE_HOST || "",
		port: 5432,
		user: process.env.PLANETSCALE_USER || "",
		password: process.env.PLANETSCALE_PASSWORD || "",
		database: process.env.PLANETSCALE_DATABASE || "",
	},
});

// Direct DB URL for dev mode (Hyperdrive doesn't work in miniflare)
const directDbUrl =
	stage === "dev"
		? `postgresql://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}:5432/${process.env.PLANETSCALE_DATABASE}?sslmode=require`
		: "";

export const server = await Worker("api", {
	entrypoint: path.join(import.meta.dirname, "src", "index.ts"),
	compatibility: "node",
	domains: stage === "prod" ? ["api.amerikvitamin.mn"] : undefined,

	adopt: true,
	bindings: {
		RATE_LIMITER: rateLimit,
		DB: hyperdriveDB,
		// Only pass DIRECT_DB_URL in dev mode
		...(directDbUrl ? { DIRECT_DB_URL: directDbUrl } : {}),
		vitStoreKV: kv,
		r2Bucket: r2,
		images: images,
		CORS_ORIGIN: process.env.CORS_ORIGIN || "",
		DASH_URL: process.env.DASH_URL || "",
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
		GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "",
		DOMAIN: process.env.DOMAIN || "",
		MESSENGER_ACCESS_TOKEN: process.env.MESSENGER_ACCESS_TOKEN || "",
		MESSENGER_VERIFY_TOKEN: process.env.MESSENGER_VERIFY_TOKEN || "",
		SMS_GATEWAY_LOGIN: process.env.SMS_GATEWAY_LOGIN || "",
		SMS_GATEWAY_PASSWORD: process.env.SMS_GATEWAY_PASSWORD || "",
		FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || "",
		GOOGLE_GENERATIVE_AI_API_KEY:
			process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
		BONUM_URL: process.env.BONUM_URL || "",
		BONUM_APP_SECRET: process.env.BONUM_APP_SECRET || "",
		BONUM_TERMINAL_ID: process.env.BONUM_TERMINAL_ID || "",
		BONUM_WEBHOOK_URL: process.env.BONUM_WEBHOOK_URL || "",
		// Upstash Search
		UPSTASH_SEARCH_URL: process.env.UPSTASH_SEARCH_URL || "",
		UPSTASH_SEARCH_TOKEN: process.env.UPSTASH_SEARCH_TOKEN || "",
		// Upstash Redis
		UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
		UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
	},

	observability: {
		enabled: true,
		logs: {
			enabled: true,
			persist: true,
			destinations: ["axiom-logs"],
		},
		traces: {
			enabled: true,
			persist: true,
			headSamplingRate: 1,
			destinations: ["axiom-traces"],
		},
	},
	placement: {
		mode: "smart",
	},
	dev: {
		port: 3006,
	},
});

await app.finalize();
