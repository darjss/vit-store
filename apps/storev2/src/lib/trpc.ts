import { createTRPCClient, httpLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { sanitizePublicTrpcResponse, trpcResponseWireSchema } from "@vit/shared";
import * as v from "valibot";
import { SuperJSON } from "superjson";

import { isServer } from "@/lib/runtime";
import { safeNavigate } from "@/lib/safe-navigate";

const checkUnauthorized = async (response: Response): Promise<boolean> => {
	if (response.status === 401) {
		return true;
	}

	const clonedResponse = response.clone();
	try {
		const data = v.parse(trpcResponseWireSchema, await clonedResponse.json());
		const { hasError, payload } = sanitizePublicTrpcResponse(data);
		if (!hasError) {
			return false;
		}

		const items = Array.isArray(payload) ? payload : [payload];
		return items.some((item) => {
			const error = item.error;
			if (!error || "json" in error) {
				return error?.json?.data?.code === "UNAUTHORIZED";
			}
			return error.data?.code === "UNAUTHORIZED" || error.code === -32_001;
		});
	} catch {
		return false;
	}
};

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;

	return apiUrlFromEnv ? `${apiUrlFromEnv}/trpc/store` : "http://localhost:3000/trpc/store";
};

const getClientBackendUrl = () => {
	// Browser calls should stay same-origin. Facebook's in-app browser is much
	// more fragile with cross-origin fetches (it only surfaces "Load failed"),
	// so route client tRPC traffic through the Astro app and let the server proxy
	// it to the API worker.
	if (!isServer) {
		return "/trpc/store";
	}

	return getBackendUrl();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithServerRetry = async (
	fetchFn: typeof fetch,
	url: Parameters<typeof fetch>[0],
	options?: Parameters<typeof fetch>[1],
) => {
	const attempts = isServer ? 3 : 1;
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fetchFn(url, options);
		} catch (error) {
			lastError = error;

			if (attempt === attempts) {
				break;
			}

			console.warn(`tRPC fetch failed; retrying (${attempt}/${attempts - 1})`, error);
			await wait(500 * attempt);
		}
	}

	throw lastError;
};

export const createServerClient = (
	cookies?: string,
	serverBinding?: { fetch: typeof fetch },
	redirectFn?: (path: string) => Response,
) => {
	const url = serverBinding ? "https://internal/trpc/store" : getBackendUrl();

	return createTRPCClient<StoreRouter>({
		links: [
			httpLink({
				fetch: async (url, options) => {
					const fetchFn = serverBinding?.fetch ? serverBinding.fetch.bind(serverBinding) : fetch;
					const headers = new Headers(options?.headers);
					if (cookies) {
						headers.set("cookie", cookies);
					}

					const response = await fetchWithServerRetry(fetchFn, url, {
						...options,
						credentials: "include",
						headers,
					});

					if (redirectFn && (await checkUnauthorized(response))) {
						redirectFn("/login");
					}

					return response;
				},
				transformer: SuperJSON,
				url,
			}),
		],
	});
};

export const api = createTRPCClient<StoreRouter>({
	links: [
		httpLink({
			fetch: async (url, options) => {
				const response = await fetchWithServerRetry(fetch, url, {
					...options,
					credentials: "include",
					headers: options?.headers,
				});

				if (await checkUnauthorized(response)) {
					if (!isServer && window.location.pathname !== "/login") {
						// Batched tRPC requests can resolve 401s concurrently; each
						// would otherwise kick off its own view transition and the
						// second throws InvalidStateError. safeNavigate coalesces
						// them and falls back to location.assign when the tab is
						// hidden.
						void safeNavigate("/login", { history: "replace" });
					}
				}

				return response;
			},
			transformer: SuperJSON,
			url: getClientBackendUrl(),
		}),
	],
});
