import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";
import type { Env } from "./env";

// The worker calls the SAME tRPC surface the storefront uses. `StoreRouter` is
// a TYPE-ONLY import (erased at build): zero api/server/db runtime code is
// pulled into the worker — only @trpc/client + superjson.
const storeApiUrl = (env: Env): string =>
	`${(env.STORE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/trpc/store`;

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

// A hung/slow store API must not hold a turn open until the platform kills it.
// Callers that need a longer budget pass their own `ms`.
export const withTimeout = (
	signal?: AbortSignal,
	ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): AbortSignal => {
	const timeout = AbortSignal.timeout(ms);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

const clients = new WeakMap<Env, TRPCClient<StoreRouter>>();
export const storeClient = (env: Env): TRPCClient<StoreRouter> => {
	let client = clients.get(env);
	if (client === undefined) {
		client = createTRPCClient<StoreRouter>({
			links: [httpLink({ transformer: SuperJSON, url: storeApiUrl(env) })],
		});
		clients.set(env, client);
	}
	return client;
};
