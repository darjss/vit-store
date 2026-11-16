import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as v from "valibot";
import type { DB } from "~/db/index";
import * as schema from "~/db/schema";

const workerEnvSchema = v.object({
	DIRECT_DB_URL: v.optional(v.string()),
});

const requestDb = new AsyncLocalStorage<DB>();

/** Runs a request or cron tick with one shared client, so every db() call inside reuses its connections. */
export const withDb = <T>(run: () => T) => requestDb.run(connect(), run);

/** Outside withDb, as in Durable Objects, each call still gets its own client. */
export function db(): DB {
	return requestDb.getStore() ?? connect();
}

// postgres.js connects lazily, so a request that never queries opens nothing.
// Workers can't share I/O across requests, so a client must never live at module scope.
function connect(): DB {
	const workerEnv = v.parse(workerEnvSchema, env);
	const connStr =
		workerEnv.DIRECT_DB_URL && workerEnv.DIRECT_DB_URL.length > 0
			? workerEnv.DIRECT_DB_URL
			: env.DB.connectionString;

	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const client = postgres(connStr, {
		fetch_types: false,
		max: 5,
		ssl: isHyperdriveProxy ? false : "require",
	});
	return drizzle(client, { schema });
}
