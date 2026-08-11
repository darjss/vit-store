import type { QueryClient } from "@tanstack/solid-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/solid-router";

import { AppError } from "@/app/app-error";
import { AppLoading } from "@/app/app-loading";
import { AppNotFound } from "@/app/app-not-found";
import { TopProgress } from "@/app/top-progress";
import type { AdminSession } from "@/lib/auth";

export interface RouterContext {
	queryClient: QueryClient;
	session?: AdminSession;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	errorComponent: AppError,
	notFoundComponent: AppNotFound,
	pendingComponent: AppLoading,
	head: () => ({
		meta: [
			{ title: "vit-admin" },
			{
				name: "description",
				content: "vit-store удирдлагын хэсэг — захиалга, бараа, шинжилгээ",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<TopProgress />
			<Outlet />
		</>
	);
}
