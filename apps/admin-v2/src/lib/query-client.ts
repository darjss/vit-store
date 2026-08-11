import { QueryCache, QueryClient } from "@tanstack/solid-query";

// One QueryClient for the whole shell (plan: query client rules).
// - No refetch on window focus for routine admin queries
// - Reads retry once for transient failures
// - Mutations never retry automatically
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 5 * 60_000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
		mutations: {
			retry: false,
		},
	},
	queryCache: new QueryCache({
		onError: (error) => {
			// TODO: surface via @vit/ui Toast once Track 1 lands. Feature tracks
			// own their inline error states; this is the last-resort log.
			console.error("[admin-v2] query failed:", error);
		},
	}),
});
