import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { toast } from "sonner";
import OrderForm from "@/components/order/order-form";
import { trpc } from "@/utils/trpc";
import { FormPageSkeleton } from "@/components/skeletons/admin-page-skeletons";

export const Route = createFileRoute("/_dash/orders/add")({
	component: RouteComponent,
	pendingComponent: FormPageSkeleton,
	loader: () => {
		// Form doesn't need initial data
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<FormPageSkeleton />}>
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
