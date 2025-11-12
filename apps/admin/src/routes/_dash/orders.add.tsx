import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { toast } from "sonner";
import OrderForm from "@/components/order/order-form";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/add")({
	component: RouteComponent,
	loader: async () => {
		// Form doesn't need initial data
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading form...</div>}>
			<OrderAddContent />
		</Suspense>
	);
}

function OrderAddContent() {
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
