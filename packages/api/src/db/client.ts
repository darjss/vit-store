import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DB } from "~/db/index";
import * as schema from "~/db/schema";

// One postgres-js client per Worker isolate, created lazily on first use.
// Every query in the codebase calls db(), and the previous per-call client
// creation leaked a new pool (up to `max` sockets) that was never closed —
// under load that exhausted the database's connection limit and surfaced as
// random INTERNAL_SERVER_ERRORs on writes. The lazy singleton caps the whole
// isolate at one pool; concurrency is handled by the pool itself (max 5).
let cachedDb: DB | undefined;

export function db(): DB {
	if (cachedDb) return cachedDb;

	// Use DIRECT_DB_URL in dev mode, Hyperdrive in prod
	const workerEnv = env as typeof env & { DIRECT_DB_URL?: string };
	const directDbUrl = workerEnv.DIRECT_DB_URL;
	const connStr =
		directDbUrl && directDbUrl.length > 0
			? directDbUrl
			: env.DB.connectionString;

	// Hyperdrive proxy URLs use a 32-char hex string as username
	// Direct connections have normal usernames - need SSL
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const client = postgres(connStr, {
		ssl: isHyperdriveProxy ? false : "require",
		// Cap the pool and reap idle/stale connections. PlanetScale and other
		// cloud proxies close idle sockets without notice; leaving them in the
		// pool made the next query on that socket fail with a bare
		// "Failed query" error and a 500. idle_timeout closes the socket before
		// the proxy does; max_lifetime bounds how long any socket is reused.
		// max 2 keeps a direct (non-Hyperdrive) connection modest: the PlanetScale
		// connection budget is small and shared with production; parallel reads
		// serialize inside the pool instead of exhausting it.
		max: 2,
		idle_timeout: 20,
		connect_timeout: 10,
		max_lifetime: 300,
		fetch_types: false,
	});
	cachedDb = drizzle(client, { schema });
	return cachedDb;
}
