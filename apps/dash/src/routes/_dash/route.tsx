import { useTRPC } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWebRequest } from "@tanstack/react-start/server";

export const Route = createFileRoute("/_dash")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const request = getWebRequest();
    const { trpc } = context.createTRPC(request.headers);
    const session = await context.queryClient.fetchQuery(
      trpc.auth.me.queryOptions()
    );

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
  },
});

function RouteComponent() {
  // const trpc = useTRPC();
  // const result = useQuery(trpc.healthCheck.queryOptions());
  // console.log(result.data);
  // const { data: session } = useQuery(trpc.auth.me.queryOptions());
  // console.log(result.data, session);
  return <div>Hello "/_dash/"!</div>;
}
