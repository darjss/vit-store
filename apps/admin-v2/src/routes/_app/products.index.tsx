import { createFileRoute } from "@tanstack/solid-router";

import { ProductsPage } from "@/features/products";

export const Route = createFileRoute("/_app/products/")({
	component: ProductsPage,
	head: () => ({
		meta: [{ title: "Бараа · vit-admin" }],
	}),
});
