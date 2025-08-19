import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash/orders")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_dash/orders"!</div>;
}
