import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import OrderForm from "@/components/order/order-form";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/add")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	return (
		<div className="space-y-4">
			<OrderForm
				onSuccess={() => {
					toast.success("Захиалга амжилттай нэмэгдлээ");
					queryClient.invalidateQueries(
						trpc.order.getPaginatedOrders.queryOptions({}),
					);
					navigate({ to: "/orders" });
				}}
			/>
		</div>
	);
}
