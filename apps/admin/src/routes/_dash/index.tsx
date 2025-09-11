import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
});

function HomeComponent() {
	return <div>Home dashboard admin</div>;
}
