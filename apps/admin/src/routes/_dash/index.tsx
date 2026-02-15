import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	ArrowUpRight,
	ChevronDown,
	ChevronUp,
	Clock,
	DollarSign,
	Eye,
	MapPin,
	Package,
	Phone,
	ShoppingBag,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateToText, getRevenueData } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
	loader: async ({ context: ctx }) => {
		await Promise.all([
			ctx.queryClient.ensureQueryData(ctx.trpc.sales.analytics.queryOptions()),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.sales.topProducts.queryOptions({
					timeRange: "daily",
					productCount: 5,
				}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.order.getPendingOrders.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.analytics.getWebAnalytics.queryOptions({
					timeRange: "daily",
				}),
			),
		]);
	},
});

function HomeComponent() {
	const { data: stats } = useSuspenseQuery(trpc.sales.analytics.queryOptions());
	const { data: orders } = useSuspenseQuery(
		trpc.order.getPendingOrders.queryOptions(),
	);
	const { data: topProducts } = useSuspenseQuery(
		trpc.sales.topProducts.queryOptions({
			timeRange: "daily",
			productCount: 5,
		}),
	);
	const { data: webAnalytics } = useSuspenseQuery(
		trpc.analytics.getWebAnalytics.queryOptions({
			timeRange: "daily",
		}),
	);

	const [ordersExpanded, setOrdersExpanded] = useState(false);
	const displayedOrders = ordersExpanded ? orders : orders.slice(0, 3);

	const revenueData = getRevenueData("daily");

	return (
		<div className="space-y-3 pb-6">
			{/* Compact Hero - Pending Orders */}
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
				className="block"
			>
				<div className="flex items-center justify-between border-2 border-border bg-primary p-3 shadow-hard-sm active:translate-y-0.5 active:shadow-none">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center border-2 border-primary-foreground/30 bg-primary-foreground/10">
							<ShoppingBag className="h-5 w-5 text-primary-foreground" />
						</div>
						<div>
							<p className="font-black font-heading text-2xl text-primary-foreground leading-none">
								{orders.length}
							</p>
							<p className="font-medium text-primary-foreground/80 text-xs">
								хүлээгдэж буй
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 font-bold text-primary-foreground text-sm">
						Харах
						<ArrowRight className="h-4 w-4" />
					</div>
				</div>
			</Link>

			{/* Today's Stats - 2x2 Grid */}
			<div className="grid grid-cols-2 gap-2">
				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<DollarSign className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Орлого
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(stats.daily.revenue)}
					</p>
					<div className="mt-1.5 flex items-center gap-0.5 text-[10px]">
						<span className="flex items-center font-medium text-green-600">
							<ArrowUpRight className="h-2.5 w-2.5" />
							12%
						</span>
						<span className="text-muted-foreground">өчигдөрөөс</span>
					</div>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Package className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Захиалга
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{stats.daily.salesCount}
					</p>
					<div className="mt-1.5 flex items-center gap-0.5 text-[10px]">
						<span className="flex items-center font-medium text-green-600">
							<ArrowUpRight className="h-2.5 w-2.5" />
							8%
						</span>
						<span className="text-muted-foreground">өчигдөрөөс</span>
					</div>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Eye className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Зочин
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{webAnalytics.current.uniqueVisitors.toLocaleString()}
					</p>
					<div className="mt-1.5 flex items-center gap-0.5 text-[10px]">
						<span
							className={`flex items-center font-medium ${webAnalytics.changes.visitors >= 0 ? "text-green-600" : "text-red-600"}`}
						>
							<ArrowUpRight className="h-2.5 w-2.5" />
							{Math.abs(webAnalytics.changes.visitors)}%
						</span>
						<span className="text-muted-foreground">өчигдөрөөс</span>
					</div>
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<TrendingUp className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Ашиг
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{formatCurrency(stats.daily.profit)}
					</p>
					<div className="mt-1.5 flex items-center gap-0.5 text-[10px]">
						<span className="flex items-center font-medium text-green-600">
							<ArrowUpRight className="h-2.5 w-2.5" />
							15%
						</span>
						<span className="text-muted-foreground">өчигдөрөөс</span>
					</div>
				</div>
			</div>

			{/* Mini Chart */}
			<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
				<div className="mb-2 flex items-center justify-between">
					<span className="font-bold text-muted-foreground text-xs uppercase tracking-wide">
						Сүүлийн 7 өдөр
					</span>
				</div>
				<div className="h-[80px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={revenueData}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<XAxis
								dataKey="date"
								tick={{ fontSize: 9, fontWeight: 600 }}
								tickLine={false}
								axisLine={false}
								dy={5}
							/>
							<Tooltip
								cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
								content={({ active, payload, label }) => {
									if (!active || !payload?.length) return null;
									return (
										<div className="border-2 border-border bg-card p-1.5 text-[10px] shadow-hard-sm">
											<p className="font-bold">{label}</p>
											<p className="font-mono">
												₮
												{new Intl.NumberFormat("mn-MN").format(
													payload[0].value as number,
												)}
											</p>
										</div>
									);
								}}
							/>
							<Bar
								dataKey="revenue"
								fill="var(--color-primary)"
								stroke="var(--color-border)"
								strokeWidth={1.5}
								radius={0}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Pending Orders - Inline Expandable */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<Clock className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Хүлээгдэж буй</span>
					</div>
					<Badge variant="secondary" className="font-mono text-xs">
						{orders.length}
					</Badge>
				</div>

				{orders.length === 0 ? (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Шинэ захиалга байхгүй
					</div>
				) : (
					<>
						<div className="divide-y divide-border">
							{displayedOrders.map((order) => (
								<Link
									key={order.id}
									to="/orders/$id"
									params={{ id: String(order.id) }}
									className="flex items-center justify-between p-3 active:bg-muted/20"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Badge
												variant="surface"
												className="shrink-0 font-mono text-[10px]"
											>
												#{String(order.id).slice(-4)}
											</Badge>
											<span className="truncate text-muted-foreground text-xs">
												{formatDateToText(order.createdAt)}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-3 text-xs">
											<span className="flex items-center gap-1">
												<Phone className="h-3 w-3 text-muted-foreground" />
												{order.customerPhone}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
											<MapPin className="h-2.5 w-2.5 shrink-0" />
											<span className="truncate">{order.address}</span>
										</div>
									</div>
									<div className="ml-2 text-right">
										<p className="font-black font-heading text-sm">
											₮{order.total.toLocaleString()}
										</p>
										<p className="text-[10px] text-muted-foreground">
											{order.products?.length || 0} бараа
										</p>
									</div>
								</Link>
							))}
						</div>

						{orders.length > 3 && (
							<button
								type="button"
								onClick={() => setOrdersExpanded(!ordersExpanded)}
								className="flex w-full items-center justify-center gap-1 border-border border-t-2 bg-muted/20 py-2.5 font-bold text-xs active:bg-muted/40"
							>
								{ordersExpanded ? (
									<>
										Хураах
										<ChevronUp className="h-3.5 w-3.5" />
									</>
								) : (
									<>
										Бүгдийг харах ({orders.length - 3})
										<ChevronDown className="h-3.5 w-3.5" />
									</>
								)}
							</button>
						)}
					</>
				)}
			</div>

			{/* Top Products - Compact */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Топ бараа</span>
					</div>
					<span className="text-muted-foreground text-xs">Өнөөдөр</span>
				</div>

				{topProducts.length === 0 ? (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Борлуулалт алга
					</div>
				) : (
					<div className="divide-y divide-border">
						{topProducts.map((product, index) => (
							<div key={product.name} className="flex items-center gap-3 p-2.5">
								<div className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border bg-muted/50 font-bold font-heading text-sm">
									{index + 1}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-bold text-sm leading-tight">
										{product.name}
									</p>
									<p className="text-[10px] text-muted-foreground">
										{product.totalSold} ширхэг
									</p>
								</div>
								<span className="shrink-0 font-bold font-mono text-xs">
									₮{(product.revenue / 1000).toFixed(0)}k
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
