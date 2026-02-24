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

const hyperdriveDB = await Hyperdrive("pscale-db", {
	origin: {
		host: env.PLANETSCALE_HOST,
		port: 5432,
		user: env.PLANETSCALE_USER,
		password: env.PLANETSCALE_PASSWORD,
		database: env.PLANETSCALE_DATABASE,
	},
});

const directDbUrl =
	stage === "dev"
		? `postgresql://${env.PLANETSCALE_USER}:${env.PLANETSCALE_PASSWORD}@${env.PLANETSCALE_HOST}:5432/${env.PLANETSCALE_DATABASE}?sslmode=require`
		: "";

export const server = await Worker("api", {
	entrypoint: path.join(import.meta.dirname, "src", "index.ts"),
	compatibility: "node",
	// Cloudflare cron is UTC; 03:00 UTC = 11:00 Ulaanbaatar (UTC+8)
	crons: ["0 3 * * *"],
	domains: stage === "prod" ? ["api.amerikvitamin.mn"] : undefined,

	adopt: true,
	bindings: {
		RATE_LIMITER: rateLimit,
		DB: hyperdriveDB,
		...(directDbUrl ? { DIRECT_DB_URL: directDbUrl } : {}),
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
		GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
		UPSTASH_SEARCH_URL: env.UPSTASH_SEARCH_URL,
		UPSTASH_SEARCH_TOKEN: env.UPSTASH_SEARCH_TOKEN,
		UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
		QPAY_URL: env.QPAY_URL,
		QPAY_USERNAME: env.QPAY_USERNAME,
		QPAY_PASSWORD: env.QPAY_PASSWORD,
		QPAY_CALLBACK_URL: env.QPAY_CALLBACK_URL ?? env.GOOGLE_CALLBACK_URL,
		POSTHOG_PERSONAL_API_KEY: env.POSTHOG_API_KEY,
		POSTHOG_PROJECT_ID: env.POSTHOG_PROJECT_ID,
		POSTHOG_HOST: env.POSTHOG_HOST,
	},

	observability: {
		enabled: true,
		logs: {
			enabled: true,
			persist: true,
			destinations: ["axiom-logs"],
		},
	},
	placement: {
		region: "aws:ap-southeast-1",
	},
	dev: {
		port: 3006,
	},
});

await app.finalize();
