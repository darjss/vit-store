import { env } from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/d1";
import type { DB } from "~/db/index";
import * as schema from "~/db/schema";

const requestDbStorage = new AsyncLocalStorage<DB>();

export function db(): DB {
	return requestDbStorage.getStore() ?? drizzle(env.DB, { schema });
}

export function withDbSession<T>(
	binding: D1Database,
	callback: () => Promise<T> | T,
): Promise<Awaited<T>> {
	const session = binding.withSession("first-unconstrained");
	const requestDb = drizzle(session as unknown as D1Database, { schema });
	return Promise.resolve(requestDbStorage.run(requestDb, callback));
}
