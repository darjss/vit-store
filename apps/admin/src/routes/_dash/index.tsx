import { createFileRoute, Link } from "@tanstack/react-router";
import { timeRangeSchema } from "@vit/shared";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";
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
	validateSearch: v.object({
		timeRange: v.optional(timeRangeSchema, "daily"),
	}),
	loader: async ({ context: ctx, location }) => {
		const timeRange =
			(location.search as { timeRange?: string })?.timeRange || "daily";
		await Promise.all([
			ctx.queryClient.ensureQueryData(ctx.trpc.sales.analytics.queryOptions()),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.sales.topProducts.queryOptions({
					timeRange: timeRange as "daily" | "weekly" | "monthly",
					productCount: 10,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.order.getPendingOrders.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getLowInventoryProducts.queryOptions(),
			),
		]);
	},
});

function HomeComponent() {
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
					<Link
						to="/orders"
						search={{
							orderStatus: "pending",
							sortField: "createdAt",
							sortDirection: "desc",
							searchTerm: "",
							page: 1,
							pageSize: 10,
						}}
					>
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

			<Suspense
				fallback={
					<div className="h-48 animate-pulse rounded-base border-2 border-border" />
				}
			>
				<StatsGrid />
			</Suspense>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<SalesChart />
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<PendingOrders />
				</Suspense>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Suspense
					fallback={
						<div className="h-80 animate-pulse rounded-base border-2 border-border" />
					}
				>
					<TopSellingProducts />
				</Suspense>
				<div className="flex flex-col gap-2">
					<QuickStats />
					<Suspense
						fallback={
							<div className="h-40 animate-pulse rounded-base border-2 border-border" />
						}
					>
						<LowStockAlerts />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
