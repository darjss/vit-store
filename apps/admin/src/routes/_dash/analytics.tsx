import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Loader />;
}
