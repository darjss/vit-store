import type {
	Context as ApiContext,
	CreateContextOptions,
	CustomerSelectType,
	Session,
	UserSelectType,
} from "@vit/api";
import { createDb } from "@vit/api/db";

export type { CreateContextOptions } from "@vit/api";

export async function createContext({
	context,
}: CreateContextOptions): Promise<ApiContext> {
	try {
		const kv = context.env.vitStoreKV;
		const r2 = context.env.r2Bucket;
		const db = createDb(context.env.DB);

		console.log("context created");
		return {
			c: context,
			session: null as Session<CustomerSelectType | UserSelectType> | null,
			db: db,
			kv,
			r2,
		};
	} catch (error) {
		console.error(error);
		throw error;
	}
}

export type Context = Awaited<ReturnType<typeof createContext>>;
