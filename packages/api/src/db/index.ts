import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";

export type DB = DrizzleD1Database<typeof schema>;

/**
 * Creates a Drizzle database instance from a Cloudflare D1 binding.
 * Must be called within a request handler, not at module scope.
 */
export function createDb(binding: D1Database): DB {
	return drizzle(binding, { schema });
}
