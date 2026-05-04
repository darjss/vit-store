import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { trpc } from "@/utils/trpc";
import { SimpleCardsPageSkeleton } from "@/components/skeletons/admin-page-skeletons";

export const Route = createFileRoute("/_dash/sandbox")({
	component: RouteComponent,
	pendingComponent: SimpleCardsPageSkeleton,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.getProductBenchmark.queryOptions(),
		);
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<SimpleCardsPageSkeleton />}>
			<SandboxContent />
		</Suspense>
	);
}

function SandboxContent() {
	const { data } = useSuspenseQuery({
		...trpc.product.getProductBenchmark.queryOptions(),
	});
	return <div>Benchmark : {data}</div>;
}
