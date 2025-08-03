import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getWebRequest } from "@tanstack/react-start/server";
import Header from "@/components/header/index";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_dash")({
	component: RouteComponent,
	beforeLoad: async ({ context }) => {
		const request = getWebRequest();
		const { trpc } = context.createTRPC(request.headers);
		const session = await context.queryClient.fetchQuery(
			trpc.auth.me.queryOptions(),
		);
		console.log("session",session)
		if (!session) {
			throw redirect({
				to: "/login",
			});
		}
	},
});

function RouteComponent() {
	return (
		<>
			<Header />
			<Outlet />
		</>
	);
}
