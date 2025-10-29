import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { CustomerAnalytics } from "@/components/analytics/customer-analytics";
import { OrderAnalytics } from "@/components/analytics/order-analytics";
import { ProductPerformance } from "@/components/analytics/product-performance";
import { RevenueAnalytics } from "@/components/analytics/revenue-analytics";
import { TimeBasedAnalytics } from "@/components/analytics/time-based-analytics";
import { WebAnalytics } from "@/components/analytics/web-analytics";

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			<div className="flex items-center gap-3">
				<BarChart3 className="h-6 w-6" />
				<h1 className="font-bold font-heading text-2xl">Нийтлэг аналитик</h1>
			</div>

			{/* Revenue Analytics Section */}
			<section>
				<RevenueAnalytics />
			</section>

			{/* Product and Customer Analytics Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<ProductPerformance />
				<CustomerAnalytics />
			</div>

			{/* Time-Based Analytics */}
			<section>
				<TimeBasedAnalytics />
			</section>

			{/* Order and Web Analytics Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<OrderAnalytics />
				<WebAnalytics />
			</div>
		</div>
	);
}
