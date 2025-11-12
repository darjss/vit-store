import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/_dash/purchases")({
	component: RouteComponent,
	loader: async () => {
		// Placeholder for future data loading
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading...</div>}>
			<div>Hello "/_dash/purchases"!</div>
		</Suspense>
	);
}
