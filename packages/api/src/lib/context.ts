import type { RequestLogger } from "evlog";
import type { Context as HonoContext } from "hono";
import type { DB } from "~/db";
import type { CustomerSelectType, UserSelectType } from "~/db/schema";
import type { Session } from "~/lib/session";

export type { CustomerSelectType, UserSelectType } from "~/db/schema";

export type CreateContextOptions = {
	context: HonoContext<{
		Bindings: Env;
		Variables: { log: RequestLogger<any> };
	}>;
};

export type Context = {
	c: HonoContext<{
		Bindings: Env;
		Variables: { log: RequestLogger<any> };
	}>;
	session: Session<CustomerSelectType | UserSelectType> | null;
	db: DB;
	kv: KVNamespace;
	r2: R2Bucket;
	/** Request-scoped wide-event logger */
	log: RequestLogger<any>;
};
