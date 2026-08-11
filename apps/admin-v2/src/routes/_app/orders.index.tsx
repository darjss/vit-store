import { createFileRoute } from "@tanstack/solid-router";

import { OrdersPage } from "@/features/orders";

export const Route = createFileRoute("/_app/orders/")({
	component: OrdersPage,
	head: () => ({
		meta: [{ title: "Захиалга · vit-admin" }],
	}),
});
