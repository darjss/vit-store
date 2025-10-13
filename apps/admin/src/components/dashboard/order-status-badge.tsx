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
					className: "bg-yellow-100 text-yellow-800 border-yellow-200",
					icon: Clock,
				};
			case "shipped":
				return {
					label: "Илгээгдсэн",
					className: "bg-blue-100 text-blue-800 border-blue-200",
					icon: Truck,
				};
			case "delivered":
				return {
					label: "Хүргэгдсэн",
					className: "bg-green-100 text-green-800 border-green-200",
					icon: CheckCircle,
				};
			case "cancelled":
				return {
					label: "Цуцлагдсан",
					className: "bg-red-100 text-red-800 border-red-200",
					icon: XCircle,
				};
				case "pendingOrders":
					return {
						label: "Хүлээгдэж буй",
						className: "bg-yellow-100 text-yellow-800 border-yellow-200",
						icon: Clock,
					};
			default:
				return {
					label: status,
					className: "bg-gray-100 text-gray-800 border-gray-200",
					icon: Clock,
				};
		}
	};

	const config = getStatusConfig(status);
	const Icon = config.icon;

	return (
		<Badge className={`flex w-fit items-center gap-1 ${config.className}`}>
			<Icon className="h-3 w-3" />
			{config.label}
		</Badge>
	);
};
