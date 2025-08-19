import type { AdminRouter } from "../../../server/src/routers/admin";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import superjson from "superjson";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

export const trpcClient = createTRPCClient<AdminRouter>({
	links: [
		httpBatchLink({
			url: `${import.meta.env.VITE_SERVER_URL}/trpc/admin`,
			transformer: superjson,
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
					headers: {
						...options?.headers,
						Origin: window.location.origin,
					},
				});
			},
		}),
	],
});

export const trpc = createTRPCOptionsProxy<AdminRouter>({
	client: trpcClient,
	queryClient,
});
