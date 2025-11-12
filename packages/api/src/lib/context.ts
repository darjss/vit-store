import type { Context as HonoContext } from "hono";
import type { DB } from "../db";
import type { CustomerSelectType, UserSelectType } from "../db/schema";
import type { Session } from "./session";

export type { CustomerSelectType, UserSelectType } from "../db/schema";
export type { Session } from "./session";

export type CreateContextOptions = {
	context: HonoContext<{
		Bindings: Env;
	}>;
};

export type Context = {
	c: HonoContext<{
		Bindings: Env;
	}>;
	session: Session<CustomerSelectType | UserSelectType> | null;
	db: DB;
	kv: KVNamespace;
	r2: R2Bucket;
};
