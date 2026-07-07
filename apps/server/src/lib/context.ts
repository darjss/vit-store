import type {
	Context as ApiContext,
	CreateContextOptions,
	CustomerSelectType,
	Session,
	UserSelectType,
} from "@vit/api";
import { db } from "@vit/api/db/client";
import type { AppRequestLogger } from "./logging";

export async function createContext({
	context,
}: CreateContextOptions): Promise<ApiContext> {
	const kv = context.env.vitStoreKV;
	const r2 = context.env.r2Bucket;
	const database = db();

	const log = context.get("log") as AppRequestLogger;
	log.set({ user_type: "anonymous" });

	return {
		c: context,
		session: null as Session<CustomerSelectType | UserSelectType> | null,
		db: database,
		kv,
		r2,
		log,
	};
}
