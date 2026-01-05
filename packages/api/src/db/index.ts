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
export function createDb(binding: Hyperdrive): DB {
	const client = postgres(binding.connectionString);
	return drizzle(client, { schema });
}
