import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "~/db/schema";

export type DB = PostgresJsDatabase<typeof schema>;

type HyperdriveConnection = Hyperdrive & { connectionString: string };

function hyperdriveConnectionFromString(connectionString: string): HyperdriveConnection {
	return { connectionString };
}

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
	const binding: HyperdriveConnection =
		Object.prototype.toString.call(bindingOrConnectionString) === "[object String]"
			? hyperdriveConnectionFromString(bindingOrConnectionString)
			: bindingOrConnectionString;

	const connStr = binding.connectionString;
	const isHyperdriveProxy = /^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(connStr);

	const client = postgres(connStr, {
		ssl: isHyperdriveProxy ? false : "require",
		max: 5,
		fetch_types: false,
	});

	return drizzle(client, { schema });
}
