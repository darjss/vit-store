import { Card, CardContent } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";

export function QuickStats() {
	const stats = [
		{
			label: "Харилцагч",
			value: mockData.totalCustomers.toLocaleString(),
			color: "text-blue-600",
			bg: "bg-blue-100",
		},
		{
			label: "Бүтээгдэхүүн",
			value: mockData.totalProducts.toLocaleString(),
			color: "text-green-600",
			bg: "bg-green-100",
		},
		{
			label: "Нийт Захиалга",
			value: mockData.totalOrders.toLocaleString(),
			color: "text-purple-600",
			bg: "bg-purple-100",
		},
		{
			label: "Агуулах",
			value: `₮${mockData.totalInventoryValue.toLocaleString()}`,
			color: "text-orange-600",
			bg: "bg-orange-100",
		},
		{
			label: "Орхисон Сагс",
			value: mockData.abandonedCarts,
			color: "text-red-600",
			bg: "bg-red-100",
		},
	];

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
			{stats.map((stat) => (
				<Card
					key={stat.label}
					className="hover:-translate-y-1 border-2 border-border bg-background shadow-hard-sm transition-transform hover:shadow-hard"
				>
					<CardContent className="flex flex-col items-center p-3 text-center">
						<span className="font-bold text-muted-foreground text-xs uppercase tracking-wide">
							{stat.label}
						</span>
						<span
							className={`mt-1 font-black font-heading text-lg ${stat.color}`}
						>
							{stat.value}
						</span>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
