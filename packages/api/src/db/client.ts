import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as v from "valibot";
import type { DB } from "~/db/index";
import * as schema from "~/db/schema";

const workerEnvSchema = v.object({
	DIRECT_DB_URL: v.optional(v.string()),
});

export function db(): DB {
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
