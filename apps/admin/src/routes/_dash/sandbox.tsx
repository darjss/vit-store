import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/sandbox")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.product.getProductBenchmark.queryOptions(),
		);
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading benchmark...</div>}>
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
