import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
	createTRPCClient,
	httpBatchLink,
	httpLink,
	isNonJsonSerializable,
	splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AdminRouter } from "@vit/api";
import { toast } from "sonner";
import superjson from "superjson";
import { responseHasUnauthorizedTrpcError } from "@/lib/trpc-unauthorized";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 5 * 60 * 1000,
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 30 * 1000,
		},
	},
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) => {
			// Skip when the mutation defines its own onError (TanStack runs both;
			// avoid double-toast by deferring to the local handler).
			if (mutation.options.onError) {
				return;
			}
			toast.error(error.message);
		},
	}),
	queryCache: new QueryCache({
		onError: (error) => {
			toast.error(error.message, {
				action: {
					label: "Дахин оролдох",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

function isBrowser(): boolean {
	return "window" in globalThis && globalThis.window != null;
}

function createAuthenticatedFetch(fetchFn: typeof fetch): typeof fetch {
	return async (url, options) => {
		const response = await fetchFn(url, options);
		if (await responseHasUnauthorizedTrpcError(response)) {
			if (isBrowser() && globalThis.window.location.pathname !== "/login") {
				globalThis.window.location.href = "/login";
			}
		}
		return response;
	};
}

export const trpcClient = createTRPCClient<AdminRouter>({
	links: [
		splitLink({
			condition: (op) => isNonJsonSerializable(op.input),
			false: httpBatchLink({
				fetch: createAuthenticatedFetch((url, options) =>
					fetch(url, {
						...options,
						credentials: "include",
						headers: {
							...options?.headers,
							Origin: globalThis.window.location.origin,
						},
					}),
				),
				transformer: superjson,
				url: `${import.meta.env.VITE_SERVER_URL}/trpc/admin`,
			}),
			true: httpLink({
				fetch: createAuthenticatedFetch((url, options) =>
					fetch(url, {
						...options,
						credentials: "include",
						headers: {
							...options?.headers,
							Origin: globalThis.window.location.origin,
						},
					}),
				),
				transformer: {
					deserialize: superjson.deserialize,
					serialize: (data) => data,
				},
				url: `${import.meta.env.VITE_SERVER_URL}/trpc/admin`,
			}),
		}),
	],
});

export const trpc = createTRPCOptionsProxy<AdminRouter>({
	client: trpcClient,
	queryClient,
});
