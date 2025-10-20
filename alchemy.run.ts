import alchemy from "alchemy";
import {
	Astro,
	D1Database,
	KVNamespace,
	R2Bucket,
	RateLimit,
	Vite,
	Worker,
} from "alchemy/cloudflare";
import { Exec } from "alchemy/os";
import { config } from "dotenv";

const app = await alchemy("vit-store");
const stage = app.stage;
config({ path: `./.env.${stage}` });
config({ path: `./apps/server/.env.${stage}` });
config({ path: `./apps/admin/.env.${stage}` });

console.log(
	"stage",
	stage,
	"cors origin",
	process.env.CORS_ORIGIN,
	"server url",
	process.env.VITE_SERVER_URL,
);
await Exec("db-gen", {
	cwd: "apps/server",
	command: "bun run db:generate",
});

const db = await D1Database("db", {
	name: `${app.name}-db`,
	migrationsDir: "apps/server/src/db/migrations",
	primaryLocationHint: "apac",
	migrationsTable: "drizzle_migrations",
});

// await Exec("db-seed", {
// 	cwd: "apps/server",
// 	command: "bun run db:seed",
// });
// KV Namespace setup
const kv = await KVNamespace("kv", {
	title: `${app.name}-kv`,
});

// R2 Bucket setup
const r2 = await R2Bucket("r2", {
	name: `${app.name}-bucket`,
});

const rateLimit = RateLimit({
	namespace_id: 1001,
	simple: {
		limit: 300,
		period: 60,
	},
});

export const server = await Worker("api", {
	cwd: "apps/server",
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

export const admin = await Vite("dash", {
	cwd: "apps/admin",
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: process.env.VITE_SERVER_URL || "",
	},
	dev: {
		command: "bun run dev",
	},
});

export const store = await Astro("front", {
	cwd: "apps/store",
	dev: {
		command: "bun run dev",
	},
});

console.log(`Server -> ${server.url}`);
console.log(`Admin  -> ${admin.url}`);
console.log(`Store  -> ${store.url}`);

await app.finalize();
