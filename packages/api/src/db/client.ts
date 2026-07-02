import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import type { DB } from "~/db/index";
import * as schema from "~/db/schema";

export function db(): DB {
	return drizzle(env.DB, { schema });
}
