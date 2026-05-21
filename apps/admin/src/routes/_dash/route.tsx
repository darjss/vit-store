import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import AppSidebar from "@/components/app-sidebar";
import Header from "@/components/header/index";
import MobileNavbar from "@/components/header/mobile-nav-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_dash")({
	component: RouteComponent,
	beforeLoad: async ({ context: ctx }) => {
		let session = ctx.queryClient.getQueryData(
			ctx.trpc.auth.me.queryOptions().queryKey,
		);

		if (!session) {
			session = await ctx.queryClient.fetchQuery({
				...ctx.trpc.auth.me.queryOptions(),
				staleTime: 1000 * 60 * 15,
				gcTime: 1000 * 60 * 30,
				retry: false,
			});
		}

		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function RouteComponent() {
	const isMobile = useIsMobile();
	return (
		<div className="h-[100dvh] w-screen overflow-hidden">
			<div className="relative min-h-[100dvh] w-full">
				<div
					className="absolute inset-0 z-0"
					style={{
						background: "white",
						backgroundImage: `
                linear-gradient(to right, rgba(71,85,105,0.15) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(71,85,105,0.15) 1px, transparent 1px),
                radial-gradient(circle at center, #FFF991 0%, transparent 70%)
            `,
						backgroundSize: "40px 40px, 40px 40px, 100% 100%",
						opacity: 0.6,
						mixBlendMode: "multiply",
					}}
				/>

				<SidebarProvider>
					<AppSidebar />
					<SidebarInset className="flex h-[100dvh] flex-col">
						<Header />

						<main className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:p-6 md:pb-6 lg:p-8 lg:pb-8">
							<Outlet />
						</main>

						{isMobile && <MobileNavbar />}
					</SidebarInset>
				</SidebarProvider>
			</div>
		</div>
	);
}
