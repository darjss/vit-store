import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Context as HonoContext } from "hono";
import type * as schema from "../db/schema";
import type { CustomerSelectType, UserSelectType } from "../db/schema";
import type { Session } from "./session";

export type { CustomerSelectType, UserSelectType } from "../db/schema";
export type { Session } from "./session";

export type CreateContextOptions = {
	context: HonoContext<{ Bindings: CloudflareBindings }>;
};

export type Context = {
	c: HonoContext<{ Bindings: CloudflareBindings }>;
	session: Session<CustomerSelectType | UserSelectType> | null;
	db: DrizzleD1Database<typeof schema>;
	kv: KVNamespace;
	r2: R2Bucket;
};
