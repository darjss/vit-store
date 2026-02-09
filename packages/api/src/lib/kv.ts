import { env } from "cloudflare:workers";

export function kv(): KVNamespace {
	return env.vitStoreKV;
}
