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
interface RouterAppContext {
	queryClient: QueryClient;
	session?: Session;
	trpc: typeof trpc;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	errorComponent: ({ error }) => <AppError error={error} />,
	head: () => ({
		links: [
			{
				href: "/favicon.svg",
				rel: "icon",
				type: "image/svg+xml",
			},
		],
		meta: [
			{
				title: "vit-admin",
			},
			{
				content: "admin dashboard for vit-store",
				name: "description",
			},
		],
	}),
	notFoundComponent: NotFound,
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
			{/* Opt-in with VITE_DEVTOOLS: the devtools buttons cover the phone tab bar. */}
			{import.meta.env.VITE_DEVTOOLS && <TanStackRouterDevtools position="bottom-left" />}
			{import.meta.env.VITE_DEVTOOLS && (
				<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
			)}
		</>
	);
}
