import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
    import type { StoreRouter } from "@server/routers/store";
import { SuperJSON } from "superjson";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;
	if (apiUrlFromEnv) return apiUrlFromEnv;

	if (import.meta.env.DEV) {
		console.log("🔴 DEV getBackendUrl");
		// Use the proxied path in development to avoid cross-origin issues
		return "/api/trpc";
	}
	console.warn(
		"API URL not configured via PUBLIC_API_URL environment variable.",
	);
	return "http://localhost:3000/api/trpc";
};

export const queryClient = new QueryClient();

// Custom httpBatchLink that logs response headers
const httpBatchLinkWithHeaderLogging = (
	opts: Parameters<typeof httpBatchLink>[0],
) => {
	return httpBatchLink({
		...opts,
		fetch: async (url, options) => {
			const response = await fetch(url, {
				...options,
				credentials: "include",
			});

			return response;
		},
	});
};

export const api = createTRPCClient<StoreRouter>({
	links: [
		loggerLink({
			enabled: (opts) =>
				(process.env.NODE_ENV === "development" &&
					typeof window !== "undefined") ||
				(opts.direction === "down" && opts.result instanceof Error),
		}),
		httpBatchLinkWithHeaderLogging({
			url: getBackendUrl(),
			transformer: SuperJSON,
		}),
	],
});

export const trpc = createTRPCOptionsProxy<StoreRouter>({
	client: api,
	queryClient,
});
