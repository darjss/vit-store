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

  const client = postgres(binding.connectionString, {
    ssl: "require",
  });

  return drizzle(client, { schema });
}
