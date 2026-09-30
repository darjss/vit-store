import { CheckCircle, Clock, Truck, XCircle } from "lucide-react";
import { orderStatusStyles } from "@vit/shared";
import type { OrderStatusType } from "@vit/shared/types";
import { Badge } from "@/components/ui/badge";
import { labelForOrderStatus, normalizeOrderStatus } from "@/lib/order-status-display";

interface OrderStatusBadgeProps {
	status: string;
}

const statusIcons = {
	cancelled: XCircle,
	created: Clock,
	delivered: CheckCircle,
	pending: Clock,
	refunded: XCircle,
	shipped: Truck,
} satisfies Partial<Record<OrderStatusType, typeof Clock>>;

export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => {
	const normalized = normalizeOrderStatus(status);
	const label = labelForOrderStatus(status);
	const className =
		(normalized ? orderStatusStyles[normalized]?.badge : undefined) ??
		"border-black bg-[#5f27cd] text-white";
	const Icon = (normalized ? statusIcons[normalized] : undefined) ?? Clock;

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
