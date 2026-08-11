import { createFileRoute } from "@tanstack/solid-router";

import { ProductDetailPage } from "@/features/products/product-detail";

export const Route = createFileRoute("/_app/products/$productId")({
	component: ProductDetailPage,
	head: () => ({
		meta: [{ title: "Бараа · vit-admin" }],
	}),
});
