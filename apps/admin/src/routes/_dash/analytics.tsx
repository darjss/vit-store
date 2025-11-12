import { createFileRoute } from "@tanstack/react-router";
import { timeRangeSchema } from "@vit/shared";
import { BarChart3 } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";
import { CategorySalesChart } from "@/components/analytics/category-sales-chart";
import { FailedPaymentsCard } from "@/components/analytics/failed-payments-card";
import { InventorySummary } from "@/components/analytics/inventory-summary";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { TimeRangeTabs } from "@/components/analytics/time-range-tabs";
import { TopBrandsChart } from "@/components/analytics/top-brands-chart";

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
	validateSearch: v.object({
		timeRange: v.optional(timeRangeSchema, "monthly"),
	}),
	loader: async ({ context: ctx, location }) => {
		const timeRange =
			(location.search as { timeRange?: string })?.timeRange || "monthly";
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.analytics.getAnalyticsData.queryOptions({
				timeRange: timeRange as "daily" | "weekly" | "monthly",
			}),
		);
	},
});

function RouteComponent() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			<div className="flex items-center gap-3">
				<BarChart3 className="h-6 w-6" />
				<h1 className="font-bold font-heading text-2xl">Нийтлэг аналитик</h1>
			</div>

			{/* Time Range Tabs */}
			<TimeRangeTabs />

			{/* KPI Cards Grid */}
			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={i}
								className="h-32 animate-pulse rounded-base border-2 border-border"
							/>
						))}
					</div>
				}
			>
				<KpiCards />
			</Suspense>

			{/* Charts Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<CategorySalesChart />
				</Suspense>
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<TopBrandsChart />
				</Suspense>
			</div>

			{/* Inventory and Failed Payments Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<InventorySummary />
				</Suspense>
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<FailedPaymentsCard />
				</Suspense>
			</div>
		</div>
	);
}
