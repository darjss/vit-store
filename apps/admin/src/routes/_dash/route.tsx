import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import AppSidebar from "@/components/app-sidebar";
import Header from "@/components/header/index";
import MobileNavbar from "@/components/header/mobile-nav-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_dash")({
	component: RouteComponent,
	beforeLoad: async ({ context: ctx }) => {
		const session = await ctx.queryClient.ensureQueryData({
			...ctx.trpc.auth.me.queryOptions(),
			staleTime: 1000 * 60 * 15,
		});
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function RouteComponent() {
	const isMobile = useIsMobile();
	return (
		<div className="h-screen w-screen overflow-hidden">
			<div className="relative min-h-screen w-full">
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
					<SidebarInset className="flex h-screen flex-col">
						<Header />

						<main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
							<Outlet />
						</main>

						{isMobile && <MobileNavbar />}
					</SidebarInset>
				</SidebarProvider>
			</div>
		</div>
	);
}
