// import { QueryClient } from "@tanstack/react-query";
// import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
// import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
// import { SuperJSON } from "superjson";
// import type { StoreRouter } from "../../../server/src/routers/store";

// const getBackendUrl = () => {
// 	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;
// 	const url = apiUrlFromEnv
// 		? `${apiUrlFromEnv}/trpc/store`
// 		: "http://localhost:3000/trpc/store";
// 	console.log("TRPC Backend URL:", url, "from env:", apiUrlFromEnv);
// 	return url;
// };

// export const queryClient = new QueryClient();

// // Custom httpBatchLink that logs response headers
// const httpBatchLinkWithHeaderLogging = (
// 	opts: Parameters<typeof httpBatchLink>[0],
// ) => {
// 	return httpBatchLink({
// 		...opts,
// 		fetch: async (url, options) => {
// 			const headers: Record<string, string> = {
// 				...(options?.headers as Record<string, string>),
// 			};

// 			// Only set Origin header in browser context
// 			if (typeof window !== "undefined") {
// 				headers.Origin = window.location.origin;
// 			}

// 			const response = await fetch(url, {
// 				...options,
// 				credentials: "include",
// 				headers,
// 			});

// 			return response;
// 		},
// 	});
// };

// export const api = createTRPCClient<StoreRouter>({
// 	links: [
// 		loggerLink({
// 			enabled: (opts) =>
// 				(process.env.NODE_ENV === "development" &&
// 					typeof window !== "undefined") ||
// 				(opts.direction === "down" && opts.result instanceof Error),
// 		}),
// 		httpBatchLinkWithHeaderLogging({
// 			url: getBackendUrl(),
// 			transformer: SuperJSON,
// 		}),
// 	],
// });

// export const trpc = createTRPCOptionsProxy<StoreRouter>({
// 	client: api,
// 	queryClient,
// });
