import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import ProductDetailSkeleton from "@/components/product/product-detail-skeleton";
import { ProductDetailPage } from "@/features/products/detail/product-detail-page";

export const Route = createFileRoute("/_dash/products/$id")({
	component: RouteComponent,
	pendingComponent: ProductDetailSkeleton,
	loader: ({ context: ctx, params }) => {
		const productId = Number(params.id);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.getProductById.queryOptions({ id: productId }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.getRestockWaitCount.queryOptions({ productId }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.order.getRecentOrdersByProductId.queryOptions({
				productId,
			}),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getProductBehavior.queryOptions({
				productId,
				timeRange: "weekly",
			}),
		);
	},
});

function RouteComponent() {
	const { id } = Route.useParams();
	return (
		<Suspense fallback={<ProductDetailSkeleton />}>
			<ProductDetailPage productId={Number(id)} />
		</Suspense>
	);
}
