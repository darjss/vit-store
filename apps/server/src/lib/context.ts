import type {
	Context as ApiContext,
	CreateContextOptions,
	CustomerSelectType,
	Session,
	UserSelectType,
} from "@vit/api";
import { createDb } from "@vit/api/db";
import { createLogger, createRequestContext } from "@vit/logger";

export type { CreateContextOptions } from "@vit/api";

export async function createContext({
	context,
}: CreateContextOptions): Promise<ApiContext> {
	const kv = context.env.vitStoreKV;
	const r2 = context.env.r2Bucket;

	// Use DIRECT_DB_URL in dev mode, Hyperdrive in prod
	const directDbUrl = (context.env as any).DIRECT_DB_URL;
	const db =
		directDbUrl && directDbUrl.length > 0
			? createDb(directDbUrl)
			: createDb(context.env.DB);

	const logContext = createRequestContext(context.req.raw, {
		userType: "anonymous",
	});
	const log = createLogger(logContext);

	return {
		c: context,
		session: null as Session<CustomerSelectType | UserSelectType> | null,
		db: db,
		kv,
		r2,
		log,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
