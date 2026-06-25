import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

// Single shared, typed tRPC client for the store API. The agent (Cloudflare
// Worker) calls the SAME tRPC surface the storefront uses, so the catalog /
// order / payment boundaries never duplicate api logic. `StoreRouter` is a
// TYPE-ONLY import (erased at build): zero api/server/db runtime code is pulled
// into the worker — only @trpc/client + superjson. All three boundaries
// (catalog.ts, order.ts, payment.ts) import `storeClient()` + `withTimeout()`
// from here so there is ONE client and ONE timeout/abort pattern.
const storeApiUrl = (): string => {
	const base = process.env.STORE_API_URL ?? "http://localhost:3000";
	return `${base.replace(/\/+$/, "")}/trpc/store`;
};

// Default deadline for a store round-trip. A hung/slow store API must not hold
// the whole agent turn open until the Worker platform kills it. Callers that
// need a longer budget (e.g. order creation) pass their own `ms`.
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

// Lazily constructed so STORE_API_URL is read at call time (mirrors the prior
// hand-rolled boundary), not at module load.
let cachedClient: TRPCClient<StoreRouter> | undefined;
export const storeClient = (): TRPCClient<StoreRouter> => {
	cachedClient ??= createTRPCClient<StoreRouter>({
		links: [httpLink({ url: storeApiUrl(), transformer: SuperJSON })],
	});
	return cachedClient;
};

// Honor the tool turn's cancellation if present, and always enforce our own
// timeout, whichever fires first. Shared so order/payment reuse the exact same
// `{ signal }` bridge with their own deadlines.
export const withTimeout = (
	signal?: AbortSignal,
	ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): AbortSignal => {
	const timeout = AbortSignal.timeout(ms);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
};
