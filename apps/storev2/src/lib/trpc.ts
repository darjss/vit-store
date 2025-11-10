import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;
	console.log(apiUrlFromEnv)
	return apiUrlFromEnv
		? `${apiUrlFromEnv}/trpc/store`
		: "http://localhost:3000/trpc/store";
};

// For worker-to-worker communication via service binding
export const createServerClient = (
	cookies?: string,
	serverBinding?: { fetch: typeof fetch }
) => {
	// In development, service bindings might not work properly, so fall back to regular HTTP
	const url = serverBinding 
		? "https://internal/trpc/store"  // Internal URL for service binding
		: getBackendUrl();

	return createTRPCClient<StoreRouter>({
		links: [
			httpBatchLink({
				url,
				transformer: SuperJSON,
				fetch: async (url, options) => {
					
					const fetchFn = serverBinding ? serverBinding!.fetch.bind(serverBinding) : fetch;
					
					return fetchFn(url, {
						...options,
						credentials: "include",
						headers: {
							...(options?.headers as Record<string, string>),
							...(cookies ? { cookie: cookies } : {}),
						},
					});
				},
			}),
		],
	});
};

// Client-side tRPC client
export const api = createTRPCClient<StoreRouter>({
	links: [
		httpBatchLink({
			url: getBackendUrl(),
			transformer: SuperJSON,
			fetch: async (url, options) => {
				console.log("fetching", url)
				const headers: Record<string, string> = {
					...(options?.headers as Record<string, string>),
				};
				
				if (typeof window !== "undefined") {
					headers.Origin = window.location.origin;
				}

				return fetch(url, {
					...options,
					credentials: "include",
					headers,
				});
			},
		}),
	],
});
