import type { Context as HonoContext } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import type { Session } from "./session";
import type { CustomerSelectType, UserSelectType } from "@/db/schema";

export type CreateContextOptions = {
	context: HonoContext<{ Bindings: CloudflareBindings }>;
};

export async function createContext({ context }: CreateContextOptions) {
	const db = drizzle(context.env.DB, { schema });
	const kv = context.env.vitStoreKV;
	return {
		c: context,
		session: null as Session<CustomerSelectType | UserSelectType> | null,
		db,
		kv,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
