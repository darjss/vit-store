import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { TopProgress } from "@/components/top-progress";
import { Toaster } from "@/components/ui/sonner";
import type { trpc } from "@/utils/trpc";
import "../index.css";
import AppError from "@/components/errors/app-error";
import NotFound from "@/components/errors/not-found";
import type { Session } from "../lib/types";
export interface RouterAppContext {
	trpc: typeof trpc;
	queryClient: QueryClient;
	session?: Session;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	errorComponent: ({ error }) => <AppError error={error} />,
	notFoundComponent: NotFound,
	head: () => ({
		meta: [
			{
				title: "vit-admin",
			},
			{
				name: "description",
				content: "admin dashboard for vit-store",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	const isLoading = useRouterState({
		select: (s) => s.isLoading,
	});

	return (
		<>
			<HeadContent />
			<TopProgress visible={isLoading} />
			<div className="grid h-svh grid-rows-[auto_1fr]">
				<Outlet />
			</div>
			<Toaster richColors />
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
		</>
	);
}
