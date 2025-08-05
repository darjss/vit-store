import Header from "@/components/header/index";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash")({
  component: RouteComponent,
  beforeLoad: async ({ context: ctx }) => {
    const session = ctx.queryClient.fetchQuery(ctx.trpc.auth.me.queryOptions());
    if (!session) {
      redirect({ to: "/login" });
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
