import { createFileRoute } from "@tanstack/solid-router";

import { HomePage } from "@/features/home";

export const Route = createFileRoute("/_app/")({
	component: HomePage,
	head: () => ({
		meta: [{ title: "Нүүр · vit-admin" }],
	}),
});
