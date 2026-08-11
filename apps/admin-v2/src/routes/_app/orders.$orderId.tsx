import { createFileRoute } from "@tanstack/solid-router";

import { OrderDetailPage } from "@/features/orders/order-detail";

export const Route = createFileRoute("/_app/orders/$orderId")({
	component: OrderDetailPage,
	head: () => ({
		meta: [{ title: "Захиалга · vit-admin" }],
	}),
});
