import { createFileRoute } from "@tanstack/solid-router";

import { AnalyticsPage } from "@/features/analytics";

export const Route = createFileRoute("/_app/analytics")({
	component: AnalyticsPage,
	head: () => ({
		meta: [{ title: "Шинжилгээ · vit-admin" }],
	}),
});
