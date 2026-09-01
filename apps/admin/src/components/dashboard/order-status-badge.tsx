import { CheckCircle, Clock, Truck, XCircle } from "lucide-react";
import { orderStatusLabels, orderStatusStyles } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { Badge } from "@/components/ui/badge";

interface OrderStatusBadgeProps {
	status: string;
}

const statusIcons: Record<string, typeof Clock> = {
	cancelled: XCircle,
	created: Clock,
	delivered: CheckCircle,
	pending: Clock,
	refunded: XCircle,
	shipped: Truck,
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
			className={`flex w-fit items-center gap-1.5 px-2 py-1 text-[11px] font-bold whitespace-nowrap shadow-none ${className}`}
			size="sm"
			variant="outline"
		>
			<Icon className="h-3 w-3" />
			{label}
		</Badge>
	);
};
