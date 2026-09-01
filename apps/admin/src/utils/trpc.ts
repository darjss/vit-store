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

async function checkUnauthorized(response: Response): Promise<boolean> {
	if (response.status === 401) {
		return true;
	}
	const cloned = response.clone();
	try {
		const data = (await cloned.json()) as
			| {
					error?: { code?: string; data?: { code?: string } };
			  }
			| Array<{ error?: { code?: string; data?: { code?: string } } }>;
		if (Array.isArray(data)) {
			return data.some(
				(item) =>
					item?.error?.data?.code === "UNAUTHORIZED" || item?.error?.code === "UNAUTHORIZED",
			);
		}
		return data?.error?.data?.code === "UNAUTHORIZED" || data?.error?.code === "UNAUTHORIZED";
	} catch {
		return false;
	}
}

function createAuthenticatedFetch(fetchFn: typeof fetch): typeof fetch {
	return async (url, options) => {
		const response = await fetchFn(url, options);
		if (await checkUnauthorized(response)) {
			if (typeof window !== "undefined" && window.location.pathname !== "/login") {
				window.location.href = "/login";
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
							Origin: window.location.origin,
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
							Origin: window.location.origin,
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
	client: trpcClient as never,
	queryClient,
});
