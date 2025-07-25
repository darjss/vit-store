import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { useTRPC } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const trpc = useTRPC();
	const result = useQuery(trpc.healthCheck.queryOptions());
	const { data: session } = useQuery(trpc.auth.me.queryOptions());
	console.log(result.data, session);
		
	return (
		<div>
			<Loader />
		</div>
	);
}
