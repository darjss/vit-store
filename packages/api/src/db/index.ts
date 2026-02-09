import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

// Hyperdrive binding type - connectionString is the main property

/**
 * Creates a database instance from a Hyperdrive binding.
 * This must be called within a request handler, not at module scope.
 *
 * In Cloudflare Workers, postgres-js will automatically use the global fetch,
 * and Hyperdrive handles the connection pooling and routing.
 */
export function createDb(binding: Hyperdrive): DB;
export function createDb(connectionString: string): DB;
export function createDb(bindingOrConnectionString: Hyperdrive | string): DB {
	const binding: Hyperdrive =
		typeof bindingOrConnectionString === "string"
			? ({ connectionString: bindingOrConnectionString } as any as Hyperdrive)
			: bindingOrConnectionString;

	const connStr = binding.connectionString;
	// Hyperdrive proxy URLs use a 32-char hex string as username (no dots/special chars)
	// e.g., postgresql://c5de5ebad34245c58c6d5d50cc9409ff:token@host
	// Direct connections have normal usernames like postgres.5xhixrjzaz36
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const client = postgres(connStr, {
		// Only require SSL for direct connections (dev mode), not Hyperdrive proxy (prod)
		ssl: isHyperdriveProxy ? false : "require",
		// Limit connections due to Workers' limits on concurrent external connections
		max: 5,
		// Disable fetch_types to avoid an extra round-trip if not using array types
		fetch_types: false,
	});

	return drizzle(client, { schema });
}
