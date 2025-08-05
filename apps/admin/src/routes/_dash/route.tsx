import Header from "@/components/header/index";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash")({
  component: RouteComponent,
  beforeLoad: async ({ context: ctx }) => {
    const session = await ctx.queryClient.fetchQuery(ctx.trpc.auth.me.queryOptions());
    console.log("session", session);
    if (!session) {
      
     throw redirect({ to: "/login" });
    }

    if(session){
      console.log("there is session")
    }
    return { session };
  },
});

function RouteComponent() {
  return (
    <div>
      <Header />
      <Outlet/>
    </div>
  );
}
