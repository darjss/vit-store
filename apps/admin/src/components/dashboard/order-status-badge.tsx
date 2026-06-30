import { CheckCircle, Clock, Truck, XCircle } from "lucide-react";
import { orderStatusLabels, orderStatusStyles } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { Badge } from "@/components/ui/badge";

interface OrderStatusBadgeProps {
	status: string;
}

const statusIcons: Record<string, typeof Clock> = {
	created: Clock,
	pending: Clock,
	shipped: Truck,
	delivered: CheckCircle,
	cancelled: XCircle,
	refunded: XCircle,
};

export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => {
	// "pendingOrders" is a legacy dashboard-hero alias for "pending".
	const normalized = status === "pendingOrders" ? "pending" : status;
	const label = orderStatusLabels[normalized as OrderStatusType] ?? status;
	const className =
		orderStatusStyles[normalized as OrderStatusType]?.badge ??
		"border-black bg-[#5f27cd] text-white";
	const Icon = statusIcons[normalized] ?? Clock;

	return (
		<Badge
			className={`flex w-fit items-center gap-1 border-2 px-2 py-0.5 font-bold text-xs ${className}`}
		>
			<Icon className="h-3 w-3" />
			{label}
		</Badge>
	);
};
