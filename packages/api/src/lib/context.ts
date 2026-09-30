import type { CatalogCacheAccumulator } from "@vit/shared";
import type { RequestLogger } from "evlog";
import type { Context as HonoContext } from "hono";
import type { DB } from "~/db";
import type { CustomerSelectType, UserSelectType } from "~/db/schema";
import type { SummarizedLogObject } from "~/lib/logging";
import type { Session } from "~/lib/session";

export type { CustomerSelectType, UserSelectType } from "~/db/schema";

export type ServerHonoVariables = {
	catalogCache?: CatalogCacheAccumulator;
	log: RequestLogger<SummarizedLogObject>;
};

export type CreateContextOptions = {
	context: HonoContext<{
		Bindings: Env;
		Variables: ServerHonoVariables;
	}>;
};

export interface WorkersCache {
	purge(options: { tags: Array<string> } | { purgeEverything: true }): Promise<void>;
}

export type Context = {
	c: HonoContext<{
		Bindings: Env;
		Variables: ServerHonoVariables;
	}>;
	cache?: WorkersCache;
	db: DB;
	kv: KVNamespace;
	/** Request-scoped wide-event logger */
	log: RequestLogger<SummarizedLogObject>;
	r2: R2Bucket;
	session: Session<CustomerSelectType | UserSelectType> | null;
};
