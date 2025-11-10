import path from "node:path";
import alchemy from "alchemy";
import {
	D1Database,
	KVNamespace,
	R2Bucket,
	RateLimit,
	Worker,
} from "alchemy/cloudflare";
import { Exec } from "alchemy/os";

const app = await alchemy("server");
const stage = app.stage;
console.log("cors origin", process.env.CORS_ORIGIN);

await Exec("db-generate", {
	cwd: path.join(import.meta.dirname, "..", "..", "packages", "api"),
	command: "bun run db:generate",
});

const db = await D1Database("db", {
	name: "vit-store-db",
	migrationsDir: "../../packages/api/src/db/migrations",
	primaryLocationHint: "apac",
	migrationsTable: "drizzle_migrations",
	adopt: true,
});

const kv = await KVNamespace("kv", {
	title: `vit-store-kv-${app.stage}`,
	adopt: true,
});

const r2 = await R2Bucket("r2", {
	name:  `vit-store-bucket-${app.stage}`,
	adopt: true,
});

const rateLimit = RateLimit({
	namespace_id: 1001,
	simple: {
		limit: 300,
		period: 60,
	},
});

export const server = await Worker("api", {
	entrypoint: path.join(import.meta.dirname, "src", "index.ts"),
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
	placement: {
		mode: "smart",
	},
	observability: {
		enabled: false,
		logs: {
			enabled: true,
			persist: true,
		},
		traces: {
			enabled: true,
			persist: true,
		},
	},
	dev: {
		port: 3006,
	},
});

console.log(`Server -> ${server.url}`);

await app.finalize();
