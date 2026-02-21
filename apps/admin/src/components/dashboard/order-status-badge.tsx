import { CheckCircle, Clock, Truck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrderStatusBadgeProps {
	status: string;
}

export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => {
	const getStatusConfig = (status: string) => {
		switch (status) {
			case "pending":
				return {
					label: "Хүлээгдэж буй",
					className: "border-border bg-[#ffa502] text-black",
					icon: Clock,
				};
			case "shipped":
				return {
					label: "Илгээгдсэн",
					className: "border-border bg-[#3742fa] text-white",
					icon: Truck,
				};
			case "delivered":
				return {
					label: "Хүргэгдсэн",
					className: "border-border bg-[#00ff88] text-black",
					icon: CheckCircle,
				};
			case "cancelled":
				return {
					label: "Цуцлагдсан",
					className: "border-border bg-[#ff4757] text-white",
					icon: XCircle,
				};
			case "pendingOrders":
				return {
					label: "Хүлээгдэж буй",
					className: "border-border bg-[#ffa502] text-black",
					icon: Clock,
				};
			default:
				return {
					label: status,
					className: "border-border bg-[#5f27cd] text-white",
					icon: Clock,
				};
		}
	};

	const config = getStatusConfig(status);
	const Icon = config.icon;

	return (
		<Badge
			className={`flex w-fit items-center gap-1 border-2 px-2 py-0.5 font-bold text-xs ${config.className}`}
		>
			<Icon className="h-3 w-3" />
			{config.label}
		</Badge>
	);
};
