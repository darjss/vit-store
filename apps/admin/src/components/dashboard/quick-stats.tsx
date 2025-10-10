import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";

export function QuickStats() {
	return (
		<Card className="h-fit border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<Activity className="h-5 w-5" />
					Хурдан статистик
				</CardTitle>
			</CardHeader>
			<CardContent className="p-3">
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
					<div className="border-2 border-border bg-card p-2 text-center shadow-sm">
						<div className="font-bold font-heading text-blue-600 text-sm">
							{mockData.totalCustomers.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">Харилцагч</div>
					</div>
					<div className="border-2 border-border bg-card p-2 text-center shadow-sm">
						<div className="font-bold font-heading text-green-600 text-sm">
							{mockData.totalProducts.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">Бүтээгдэхүүн</div>
					</div>
					<div className="border-2 border-border bg-card p-2 text-center shadow-sm">
						<div className="font-bold font-heading text-purple-600 text-sm">
							{mockData.totalOrders.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">Захиалга</div>
					</div>
					<div className="border-2 border-border bg-card p-2 text-center shadow-sm">
						<div className="font-bold font-heading text-orange-600 text-sm">
							₮{mockData.totalInventoryValue.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-xs">
							Агуулахын үнэлгээ
						</div>
					</div>
					<div className="border-2 border-border bg-card p-2 text-center shadow-sm">
						<div className="font-bold font-heading text-red-600 text-sm">
							{mockData.abandonedCarts}
						</div>
						<div className="text-muted-foreground text-xs">Орхисон сагс</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
