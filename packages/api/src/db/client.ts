import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DB } from "./index";
import * as schema from "./schema";

export function db(): DB {
	// Use DIRECT_DB_URL in dev mode, Hyperdrive in prod
	const directDbUrl = (env as any).DIRECT_DB_URL;
	const connStr =
		directDbUrl && directDbUrl.length > 0
			? directDbUrl
			: env.DB.connectionString;

	// Hyperdrive proxy URLs use a 32-char hex string as username
	// Direct connections have normal usernames - need SSL
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const client = postgres(connStr, {
		ssl: isHyperdriveProxy ? false : "require",
		max: 5,
		fetch_types: false,
	});
	return drizzle(client, { schema });
}
