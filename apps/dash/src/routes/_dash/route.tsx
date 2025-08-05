import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getWebRequest } from "@tanstack/react-start/server";
import Header from "@/components/header/index";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_dash")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const request = getWebRequest();
    const { trpc } = context.createTRPC(request.headers);
    const session = await context.queryClient.fetchQuery(
      trpc.auth.me.queryOptions()
    );

    console.log("session", session,"typeof", typeof session);
    if (!session) {
      console.log("no session")
      throw redirect({
        to: "/login",
      });
    }
    if(session){
      console.log("there is session")
      throw redirect({
        to: "/orders"
      })
    }
    return { session };
  },
});

function RouteComponent() {
  return (
    <SidebarProvider>
      <SidebarInset>
        <Header />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
