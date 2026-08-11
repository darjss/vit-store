import "@fontsource-variable/onest";
import { QueryClientProvider } from "@tanstack/solid-query";
import type { SolidNode } from "@tanstack/solid-router";
import { createRouter, RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";

import { AppLoading } from "@/app/app-loading";
import { queryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";
import "./styles/app.css";

const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
	defaultPreloadStaleTime: 30_000,
	defaultPendingComponent: AppLoading,
	defaultPendingMs: 100,
	defaultPendingMinMs: 300,
	scrollRestoration: true,
	Wrap: (props: { children: SolidNode }) => (
		<QueryClientProvider client={queryClient}>
			{props.children}
		</QueryClientProvider>
	),
});

declare module "@tanstack/solid-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

render(() => <RouterProvider router={router} />, rootElement);
