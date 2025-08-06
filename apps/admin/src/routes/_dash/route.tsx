import AppSidebar from "@/components/app-sidebar";
import Header from "@/components/header/index";
import MobileNavbar from "@/components/header/mobile-nav-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

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
    <div className="h-screen w-screen overflow-hidden bg-background">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <div className="flex-1 overflow-auto p-4">
            <Outlet />
          </div>
          {isMobile && <MobileNavbar />}
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
