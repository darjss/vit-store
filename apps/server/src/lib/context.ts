import type {
	Context as ApiContext,
	CreateContextOptions,
	CustomerSelectType,
	Session,
	UserSelectType,
	WorkersCache,
} from "@vit/api";
import { createDb } from "@vit/api/db";
import type { AppRequestLogger } from "./logging";

function resolveWorkersCache(
	context: CreateContextOptions["context"],
): WorkersCache | undefined {
	try {
		return (context.executionCtx as unknown as { cache?: WorkersCache })?.cache;
	} catch {
		return undefined;
	}
}

export async function createContext({
	context,
}: CreateContextOptions): Promise<ApiContext> {
	const kv = context.env.vitStoreKV;
	const r2 = context.env.r2Bucket;
	const cache = resolveWorkersCache(context);
	type EnvWithDirectDbUrl = typeof context.env & { DIRECT_DB_URL?: string };

	// Use DIRECT_DB_URL in dev mode, Hyperdrive in prod
	const directDbUrl = (context.env as EnvWithDirectDbUrl).DIRECT_DB_URL;
	const db =
		directDbUrl && directDbUrl.length > 0
			? createDb(directDbUrl)
			: createDb(context.env.DB);

	const log = context.get("log") as AppRequestLogger;
	log.set({ user_type: "anonymous" });

	return {
		c: context,
		session: null as Session<CustomerSelectType | UserSelectType> | null,
		db: db,
		kv,
		r2,
		cache,
		log,
	};
}
