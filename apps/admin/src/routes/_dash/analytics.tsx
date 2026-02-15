import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { timeRangeSchema } from "@vit/shared";
import {
	AlertTriangle,
	ArrowRight,
	Award,
	BarChart3,
	DollarSign,
	Package,
	Repeat,
	TrendingDown,
	TrendingUp,
	Warehouse,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import * as v from "valibot";
import { ProductPerformance } from "@/components/analytics/product-performance";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
	validateSearch: v.object({
		timeRange: v.optional(timeRangeSchema, "monthly"),
	}),
	loader: async ({ context: ctx, location }) => {
		const timeRange =
			(location.search as { timeRange?: string })?.timeRange || "monthly";
		const tr = timeRange as "daily" | "weekly" | "monthly";
		await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getAnalyticsData.queryOptions({
					timeRange: tr,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getWebAnalytics.queryOptions({
					timeRange: tr,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getConversionFunnel.queryOptions({
					timeRange: tr,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getDailyVisitorTrend.queryOptions({
					timeRange: tr,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getMostViewedProducts.queryOptions({
					timeRange: tr,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getTopSearches.queryOptions({
					timeRange: tr,
				}),
			),
		]);
	},
});

const COLORS = [
	"var(--color-primary)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
];

function RouteComponent() {
	const { timeRange = "monthly" } = Route.useSearch();
	const navigate = useNavigate({ from: "/analytics" });
	const tr = timeRange as "daily" | "weekly" | "monthly";

	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({ timeRange: tr }),
	);
	const { data: webAnalytics } = useSuspenseQuery(
		trpc.analytics.getWebAnalytics.queryOptions({ timeRange: tr }),
	);
	const { data: funnel } = useSuspenseQuery(
		trpc.analytics.getConversionFunnel.queryOptions({ timeRange: tr }),
	);
	const { data: dailyTrend } = useSuspenseQuery(
		trpc.analytics.getDailyVisitorTrend.queryOptions({ timeRange: tr }),
	);
	const { data: mostViewedProducts } = useSuspenseQuery(
		trpc.analytics.getMostViewedProducts.queryOptions({ timeRange: tr }),
	);
	const { data: topSearches } = useSuspenseQuery(
		trpc.analytics.getTopSearches.queryOptions({ timeRange: tr }),
	);

	const categoryMap = new Map<string, number>();
	for (const sale of data.salesByCategory) {
		const current = categoryMap.get(sale.categoryName) || 0;
		categoryMap.set(sale.categoryName, current + sale.total);
	}
	const categoryData = Array.from(categoryMap.entries())
		.map(([name, value]) => ({ name, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 5);

	const brandData = data.topBrands
		.map((brand) => ({
			name: brand.brandName,
			revenue: brand.total,
			qty: brand.quantity,
		}))
		.slice(0, 5);

	const lowStockItems = data.lowInventoryProducts.slice(0, 3);
	const { count: failedCount, total: failedTotal } = data.failedPayments;

	const timeRangeLabel =
		timeRange === "daily"
			? "Өнөөдөр"
			: timeRange === "weekly"
				? "7 хоног"
				: "Сар";

	return (
		<div className="space-y-3 pb-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<BarChart3 className="h-5 w-5" />
					<h1 className="font-bold font-heading text-lg">Аналитик</h1>
				</div>
				<div className="flex border-2 border-border bg-card shadow-hard-sm">
					{(["daily", "weekly", "monthly"] as const).map((range) => (
						<button
							key={range}
							type="button"
							onClick={() =>
								navigate({
									to: "/analytics",
									search: { timeRange: range },
								})
							}
							className={`px-3 py-1.5 font-bold text-xs transition-colors ${
								timeRange === range
									? "bg-primary text-primary-foreground"
									: "bg-card hover:bg-muted"
							}`}
						>
							{range === "daily"
								? "Өдөр"
								: range === "weekly"
									? "7 хоног"
									: "Сар"}
						</button>
					))}
				</div>
			</div>

			{/* ─── PostHog Web Analytics ──────────────────────────── */}
			<WebAnalytics
				webAnalytics={webAnalytics}
				funnel={funnel}
				dailyTrend={dailyTrend}
				timeRangeLabel={timeRangeLabel}
			/>

			{/* ─── PostHog Product Performance ───────────────────── */}
			<ProductPerformance
				mostViewedProducts={mostViewedProducts}
				topSearches={topSearches}
				timeRangeLabel={timeRangeLabel}
			/>

			{/* ─── DB-backed KPI Grid ────────────────────────────── */}
			<div className="grid grid-cols-2 gap-2">
				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<DollarSign className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Дундаж захиалга
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(data.averageOrderValue)}
					</p>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<TrendingUp className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Нийт ашиг
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(data.totalProfit)}
					</p>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Repeat className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Давтан захиалга
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{data.repeatCustomers}
					</p>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<AlertTriangle className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Бага үлдэгдэл
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{data.metrics.lowStockCount}
					</p>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Package className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Топ брэнд орлого
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(data.metrics.topBrandRevenue)}
					</p>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Warehouse className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Бараа үнэлгээ
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(data.metrics.currentProductsValue)}
					</p>
				</div>
			</div>

			{/* Category Sales - Compact Pie */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<BarChart3 className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Ангилалаар</span>
					</div>
					<span className="text-muted-foreground text-xs">
						{timeRangeLabel}
					</span>
				</div>
				{categoryData.length > 0 ? (
					<div className="flex items-center gap-3 p-3">
						<div className="h-[120px] w-[120px] shrink-0">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={categoryData}
										cx="50%"
										cy="50%"
										innerRadius={30}
										outerRadius={55}
										paddingAngle={2}
										dataKey="value"
										stroke="var(--color-border)"
										strokeWidth={1.5}
									>
										{categoryData.map((_, index) => (
											<Cell
												key={`cell-${index}`}
												fill={COLORS[index % COLORS.length]}
											/>
										))}
									</Pie>
									<Tooltip
										content={({ active, payload }) => {
											if (!active || !payload?.length) return null;
											return (
												<div className="border-2 border-border bg-card p-1.5 text-[10px] shadow-hard-sm">
													<p className="font-bold">{payload[0].name}</p>
													<p className="font-mono">
														{formatCurrency(payload[0].value as number)}
													</p>
												</div>
											);
										}}
									/>
								</PieChart>
							</ResponsiveContainer>
						</div>
						<div className="flex-1 space-y-1.5">
							{categoryData.map((cat, i) => (
								<div
									key={cat.name}
									className="flex items-center justify-between text-xs"
								>
									<div className="flex items-center gap-2">
										<div
											className="h-2.5 w-2.5 border border-border"
											style={{ backgroundColor: COLORS[i % COLORS.length] }}
										/>
										<span className="truncate font-medium">{cat.name}</span>
									</div>
									<span className="shrink-0 font-mono text-muted-foreground">
										₮{(cat.value / 1000).toFixed(0)}k
									</span>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Өгөгдөл байхгүй
					</div>
				)}
			</div>

			{/* Top Brands - Simple List with Progress Bars */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<Award className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Топ брэндүүд</span>
					</div>
					<span className="text-muted-foreground text-xs">
						{timeRangeLabel}
					</span>
				</div>
				{brandData.length > 0 ? (
					<div className="divide-y divide-border">
						{brandData.map((brand, index) => {
							const maxRevenue = brandData[0]?.revenue || 1;
							const percentage = (brand.revenue / maxRevenue) * 100;
							return (
								<div key={brand.name} className="relative p-2.5">
									<div
										className="absolute inset-y-0 left-0 bg-primary/15"
										style={{ width: `${percentage}%` }}
									/>
									<div className="relative flex items-center justify-between">
										<div className="flex items-center gap-2.5">
											<div className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-border bg-card font-bold font-heading text-xs">
												{index + 1}
											</div>
											<div>
												<p className="font-bold text-sm leading-tight">
													{brand.name}
												</p>
												<p className="text-[10px] text-muted-foreground">
													{brand.qty} ширхэг
												</p>
											</div>
										</div>
										<span className="shrink-0 font-bold font-mono text-xs">
											₮{(brand.revenue / 1000).toFixed(0)}k
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Өгөгдөл байхгүй
					</div>
				)}
			</div>

			{/* Low Stock Alert - Compact List */}
			{lowStockItems.length > 0 && (
				<div className="border-2 border-orange-400 bg-orange-50 shadow-hard-sm">
					<div className="flex items-center justify-between border-orange-300 border-b-2 bg-orange-100/50 px-3 py-2">
						<div className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-orange-600" />
							<span className="font-bold text-orange-800 text-sm">
								Бага үлдэгдэл
							</span>
						</div>
						{data.lowInventoryProducts.length > 3 && (
							<Link
								to="/products"
								className="flex items-center gap-1 font-medium text-orange-700 text-xs"
							>
								Бүгд ({data.lowInventoryProducts.length})
								<ArrowRight className="h-3 w-3" />
							</Link>
						)}
					</div>
					<div className="divide-y divide-orange-200">
						{lowStockItems.map((item) => (
							<div
								key={item.productId}
								className="flex items-center justify-between p-2.5"
							>
								<div className="flex min-w-0 items-center gap-2.5">
									{item.imageUrl && (
										<img
											src={item.imageUrl}
											alt={item.name}
											className="h-9 w-9 shrink-0 border-2 border-orange-300 object-cover"
										/>
									)}
									<div className="min-w-0">
										<p className="truncate font-bold text-sm leading-tight">
											{item.name}
										</p>
										<p className="text-[10px] text-orange-700">
											{formatCurrency(item.price)}
										</p>
									</div>
								</div>
								<Badge
									variant="outline"
									className="shrink-0 border-orange-400 bg-orange-100 font-bold text-[10px] text-orange-700"
								>
									{item.stock} үлдсэн
								</Badge>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Failed Payments - Compact */}
			{failedCount > 0 && (
				<div className="border-2 border-red-400 bg-red-50 shadow-hard-sm">
					<div className="flex items-center gap-2 border-red-300 border-b-2 bg-red-100/50 px-3 py-2">
						<TrendingDown className="h-4 w-4 text-red-600" />
						<span className="font-bold text-red-800 text-sm">
							Амжилтгүй төлбөр
						</span>
					</div>
					<div className="flex items-center justify-between p-3">
						<div>
							<p className="font-black font-heading text-2xl text-red-600">
								{failedCount}
							</p>
							<p className="text-red-700 text-xs">төлбөр</p>
						</div>
						<div className="text-right">
							<p className="font-black font-heading text-lg">
								{formatCurrency(failedTotal)}
							</p>
							<p className="text-muted-foreground text-xs">нийт дүн</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
