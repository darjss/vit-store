import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const result = trpc.healthCheck.useQuery();
	console.log(result.data);

	return (
		<div>
			<Loader />
		</div>
	);
}
