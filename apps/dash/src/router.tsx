import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import Loader from "./components/loader";
import "./index.css";
import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import superjson from "superjson";
import type { AdminRouter } from "../../server/src/routers/admin/index";
import { SidebarProvider } from "./components/ui/sidebar";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

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
	defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

const timingLink: TRPCLink<AdminRouter> = () => {
	return ({ next, op }) => {
		return observable((observer) => {
			const startTime = Date.now();
			const unsubscribe = next(op).subscribe({
				next(value) {
					const duration = Date.now() - startTime;
					console.log(`[TRPC Request] ${op.path} completed in ${duration}ms`);
					observer.next(value);
				},
				error(err) {
					const duration = Date.now() - startTime;
					console.error(
						`[TRPC Request] ${op.path} failed in ${duration}ms`,
						err,
					);
					observer.error(err);
				},
				complete() {
					observer.complete();
				},
			});
			return unsubscribe;
		});
	};
};
const isServer = typeof window === "undefined";
console.log(isServer ? "this is server" : "this is client");
function createTRPC(headers?: Headers) {
	const trpcClient = createTRPCClient<AdminRouter>({
		links: [
			timingLink,
			httpBatchLink({
				transformer: superjson,
				url: `${import.meta.env.VITE_SERVER_URL}/trpc/admin`,
				fetch(url, options) {
					const cookie = headers?.get("cookie");
					return fetch(url, {
						...options,
						credentials: "include",
						headers: {
							...options?.headers,
							cookie: cookie || "",
						},
					});
				},
			}),
		],
	});

	const trpc = createTRPCOptionsProxy({
		client: trpcClient,
		queryClient,
	});

	return { trpcClient, trpc };
}

const { trpcClient, trpc } = createTRPC();
export const createRouter = () => {
	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		context: { trpc, queryClient, createTRPC },
		defaultPendingComponent: () => <Loader />,
		defaultNotFoundComponent: () => <div>Not Found</div>,
		Wrap: ({ children }) => (
			<QueryClientProvider client={queryClient}>
				<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
					<SidebarProvider>{children}</SidebarProvider>
				</TRPCProvider>
			</QueryClientProvider>
		),
	});
	return router;
};
export interface RouterAppContext {
	queryClient: QueryClient;
	trpc: typeof trpc;
	createTRPC: typeof createTRPC;
}
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createRouter>;
	}
}
