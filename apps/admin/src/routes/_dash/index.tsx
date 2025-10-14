import type { timeRangeType } from "@server/lib/zod/schema";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { LowStockAlerts } from "@/components/dashboard/low-stock-alerts";
import { PendingOrders } from "@/components/dashboard/pending-orders";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TopSellingProducts } from "@/components/dashboard/top-selling-products";
import { Button } from "@/components/ui/button";
import { mockData } from "@/lib/mock-data";

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
});

function HomeComponent() {
	const [selectedPeriod, _setSelectedPeriod] = useState<timeRangeType>("daily");

	return (
		<div className="space-y-6 p-2 sm:p-6">
			<div className="border-2 border-border bg-primary shadow-shadow">
				<div className="flex items-center justify-between p-4">
					<div className="flex items-center gap-3">
						<ShoppingCart className="h-6 w-6" />
						<div>
							<span className="font-bold font-heading text-lg">
								{mockData.pendingOrders} хүлээгдэж буй захиалга
							</span>
						</div>
					</div>
					<Link to="/orders">
						<Button
							variant="secondary"
							size="sm"
							className="border-2 border-border shadow-shadow hover:shadow-md"
						>
							Захиалгууд харах
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</Link>
				</div>
			</div>

			<StatsGrid />

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<SalesChart selectedPeriod={selectedPeriod} />
				<PendingOrders />
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<TopSellingProducts timeRange={selectedPeriod} />
				<div className="flex flex-col gap-2">
					<QuickStats />
					<LowStockAlerts />
				</div>
			</div>
		</div>
	);
}
