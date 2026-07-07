import type { CatalogCacheAccumulator } from "@vit/shared";
import type { RequestLogger } from "evlog";
import type { Context as HonoContext } from "hono";
import type { DB } from "~/db";
import type { CustomerSelectType, UserSelectType } from "~/db/schema";
import type { Session } from "~/lib/session";

export type { CustomerSelectType, UserSelectType } from "~/db/schema";

export type ServerHonoVariables = {
	log: RequestLogger<any>;
	catalogCache?: CatalogCacheAccumulator;
};

export type CreateContextOptions = {
	context: HonoContext<{
		Bindings: Env;
		Variables: ServerHonoVariables;
	}>;
};

export interface WorkersCache {
	purge(options: { tags: string[] } | { purgeEverything: true }): Promise<void>;
}

export type Context = {
	c: HonoContext<{
		Bindings: Env;
		Variables: ServerHonoVariables;
	}>;
	session: Session<CustomerSelectType | UserSelectType> | null;
	db: DB;
	kv: KVNamespace;
	r2: R2Bucket;
	cache?: WorkersCache;
	/** Request-scoped wide-event logger */
	log: RequestLogger<any>;
};
