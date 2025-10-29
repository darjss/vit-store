import alchemy from "alchemy";
import {
	D1Database,
	KVNamespace,
	R2Bucket,
	RateLimit,
	Worker,
} from "alchemy/cloudflare";
import { Exec } from "alchemy/os";
import { config } from "dotenv";

const app = await alchemy("server");
const stage = app.stage;
config({ path: `.env.${stage}` });

console.log("stage", stage, "cors origin", process.env.CORS_ORIGIN);

await Exec("db-generate", {
	command: "bun run db:generate",
});

const db = await D1Database("db", {
	name: "vit-store-db" + stage,
	migrationsDir: "../../packages/api/src/db/migrations",
	primaryLocationHint: "apac",
	migrationsTable: "drizzle_migrations",
});

const kv = await KVNamespace("kv", {
	title: "vit-store-kv" + stage,
});

const r2 = await R2Bucket("r2", {
	name: "vit-store-bucket" + stage,
});

const rateLimit = RateLimit({
	namespace_id: 1001,
	simple: {
		limit: 300,
		period: 60,
	},
});

export const server = await Worker("api", {
	entrypoint: "src/index.ts",
	compatibility: "node",
	bindings: {
		RATE_LIMITER: rateLimit,
		DB: db,
		vitStoreKV: kv,
		r2Bucket: r2,
		CORS_ORIGIN: process.env.CORS_ORIGIN || "",
		DASH_URL: process.env.DASH_URL || "",
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
		GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "",
		DOMAIN: process.env.DOMAIN || "",
	},
	dev: {
		port: 3006,
	},
});

console.log(`Server -> ${server.url}`);

await app.finalize();
