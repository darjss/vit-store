import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import { SuperJSON } from "superjson";

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;

	const url = apiUrlFromEnv
		? `${apiUrlFromEnv}/trpc/store`
		: "http://localhost:3000/trpc/store";
	console.log("TRPC Backend URL:", url, "from env:", apiUrlFromEnv);
	return url;
};

// Custom httpBatchLink that logs response headers
const httpBatchLinkWithHeaderLogging = (
	opts: Parameters<typeof httpBatchLink>[0],
) => {
	return httpBatchLink({
		...opts,
		fetch: async (url, options) => {
			const headers: Record<string, string> = {
				...(options?.headers as Record<string, string>),
			};

			if (typeof window !== "undefined") {
				headers.Origin = window.location.origin;
			}

			const response = await fetch(url, {
				...options,
				credentials: "include",
				headers,
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
