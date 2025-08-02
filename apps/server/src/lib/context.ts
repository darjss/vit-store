import { drizzle } from "drizzle-orm/d1";
import type { Context as HonoContext } from "hono";
import type { CustomerSelectType, UserSelectType } from "@/db/schema";
import * as schema from "@/db/schema";
import type { Session } from "./session";

export type CreateContextOptions = {
  context: HonoContext<{ Bindings: CloudflareBindings }>;
};

export async function createContext({ context }: CreateContextOptions) {
  try {
    const db = drizzle(context.env.DB, { schema });
    const kv = context.env.vitStoreKV;
    console.log("context created");
    return {
      c: context,
      session: null as Session<CustomerSelectType | UserSelectType> | null,
      db,
      kv,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>;
