import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import AppSidebar from "@/components/app-sidebar";
import Header from "@/components/header/index";
import MobileNavbar from "@/components/header/mobile-nav-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_dash")({
	beforeLoad: async ({ context: ctx }) => {
		let session = ctx.queryClient.getQueryData(ctx.trpc.auth.me.queryOptions().queryKey);

		if (!session) {
			session = await ctx.queryClient.fetchQuery({
				...ctx.trpc.auth.me.queryOptions(),
				gcTime: 1000 * 60 * 30,
				retry: false,
				staleTime: 1000 * 60 * 15,
			});
		}

		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const isMobile = useIsMobile();

	return (
		<SidebarProvider className="h-[100dvh] overflow-hidden">
			<AppSidebar />
			<SidebarInset className="bg-background flex h-[100dvh] flex-col">
				<Header />
				<main className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:p-6 md:pb-6">
					<Outlet />
				</main>
				{isMobile && <MobileNavbar />}
			</SidebarInset>
		</SidebarProvider>
	);
}
