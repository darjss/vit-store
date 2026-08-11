import { Outlet } from "@tanstack/solid-router";

import { BottomNav } from "./bottom-nav";
import { TopNav } from "./top-nav";

// Variant B shell: no header on mobile — content plus the bottom nav; desktop
// adds the top bar without changing the mobile information order.
export function AppShell() {
	return (
		<div class="min-h-dvh bg-canvas">
			<a
				href="#main-content"
				class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-[10px] focus:bg-surface focus:px-4 focus:py-2 focus:font-bold focus:text-sm focus:shadow-lift"
			>
				Агуулга руу шилжих
			</a>
			<TopNav />
			<main
				id="main-content"
				class="mx-auto w-full max-w-[760px] px-4 pt-4 pb-28 md:px-6 md:pt-8 md:pb-16"
			>
				<Outlet />
			</main>
			<BottomNav />
		</div>
	);
}
