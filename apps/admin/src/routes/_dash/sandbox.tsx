import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/sandbox")({
	component: RouteComponent,
});

function RouteComponent() {
	const { data } = useQuery({
		...trpc.product.getProductBenchmark.queryOptions(),
	});
	return <div>Benchmark : {data}</div>;
}
