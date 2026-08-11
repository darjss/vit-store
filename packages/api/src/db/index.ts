import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "~/db/schema";

export type DB = PostgresJsDatabase<typeof schema>;

// Hyperdrive binding type - connectionString is the main property

const cachedDbsByConnStr = new Map<string, DB>();

/**
 * Creates a database instance from a Hyperdrive binding or a connection
 * string. Called from createContext once per request; the client is cached
 * per connection string so requests reuse one pool instead of leaking one
 * (see db/client.ts for the same rationale).
 */
export function createDb(binding: Hyperdrive): DB;
export function createDb(connectionString: string): DB;
export function createDb(bindingOrConnectionString: Hyperdrive | string): DB {
	type HyperdriveConnection = Hyperdrive & { connectionString: string };

	const binding: HyperdriveConnection =
		typeof bindingOrConnectionString === "string"
			? ({
					connectionString: bindingOrConnectionString,
				} as HyperdriveConnection)
			: bindingOrConnectionString;

	const connStr = binding.connectionString;
	// Hyperdrive proxy URLs use a 32-char hex string as username (no dots/special chars)
	// e.g., postgresql://c5de5ebad34245c58c6d5d50cc9409ff:token@host
	// Direct connections have normal usernames like postgres.5xhixrjzaz36
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const cache = cachedDbsByConnStr.get(connStr);
	if (cache) return cache;

	const client = postgres(connStr, {
		// Only require SSL for direct connections (dev mode), not Hyperdrive proxy (prod)
		ssl: isHyperdriveProxy ? false : "require",
		// Cap the pool and reap idle/stale connections. Cloud proxies close
		// idle sockets without notice; leaving them pooled made the next query
		// on that socket fail with a bare "Failed query" error and a 500.
		// max 2 keeps a direct (non-Hyperdrive) connection modest: the
		// PlanetScale connection budget is small and shared with production;
		// parallel reads serialize inside the pool instead of exhausting it.
		max: 2,
		idle_timeout: 20,
		connect_timeout: 10,
		max_lifetime: 300,
		// Disable fetch_types to avoid an extra round-trip if not using array types
		fetch_types: false,
	});
	const database = drizzle(client, { schema });
	cachedDbsByConnStr.set(connStr, database);
	return database;
}
