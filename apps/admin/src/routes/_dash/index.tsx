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
import { DashboardPageSkeleton } from "@/components/skeletons/admin-page-skeletons";

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(ctx.trpc.sales.analytics.queryOptions());
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.sales.topProducts.queryOptions({
				productCount: 5,
				timeRange: "daily",
			}),
		);
		void ctx.queryClient.prefetchQuery(ctx.trpc.order.getPendingOrders.queryOptions());
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getWebAnalytics.queryOptions({ timeRange: "daily" }),
		);
	},
	pendingComponent: DashboardPageSkeleton,
});

function HomeComponent() {
	const { data: stats } = useSuspenseQuery(trpc.sales.analytics.queryOptions());
	const { data: orders } = useSuspenseQuery(trpc.order.getPendingOrders.queryOptions());
	const { data: topProducts } = useSuspenseQuery(
		trpc.sales.topProducts.queryOptions({
			productCount: 5,
			timeRange: "daily",
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
				className="block"
				search={{
					orderStatus: "pending",
					page: 1,
					pageSize: 10,
					searchTerm: "",
					sortDirection: "desc",
					sortField: "createdAt",
				}}
				to="/orders"
			>
				<div className="border-border bg-primary shadow-hard-sm flex items-center justify-between border-2 p-3 active:translate-y-0.5 active:shadow-none">
					<div className="flex items-center gap-3">
						<div className="border-primary-foreground/30 bg-primary-foreground/10 flex h-10 w-10 items-center justify-center border-2">
							<ShoppingBag className="text-primary-foreground h-5 w-5" />
						</div>
						<div>
							<p className="font-heading text-primary-foreground text-2xl leading-none font-black">
								{orders.length}
							</p>
							<p className="text-primary-foreground/80 text-xs font-medium">хүлээгдэж буй</p>
						</div>
					</div>
					<div className="text-primary-foreground flex items-center gap-1 text-sm font-bold">
						Харах
						<ArrowRight className="h-4 w-4" />
					</div>
				</div>
			</Link>

			{/* Today's Stats - 2x2 Grid */}
			<div className="grid grid-cols-2 gap-2">
				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<DollarSign className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Орлого</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
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

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Package className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Захиалга</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
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

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Eye className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Зочин</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
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

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<TrendingUp className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Ашиг</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
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
			<div className="border-border bg-card shadow-hard-sm border-2 p-3">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
						Сүүлийн 7 өдөр
					</span>
				</div>
				<div className="h-[80px] w-full">
					<ResponsiveContainer height="100%" width="100%">
						<BarChart data={revenueData} margin={{ bottom: 0, left: 0, right: 0, top: 0 }}>
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={{ fontSize: 9, fontWeight: 600 }}
								tickLine={false}
							/>
							<Tooltip
								content={({ active, label, payload }) => {
									if (!active || !payload?.length) {
										return null;
									}
									return (
										<div className="border-border bg-card shadow-hard-sm border-2 p-1.5 text-[10px]">
											<p className="font-bold">{label}</p>
											<p className="font-mono">
												₮{new Intl.NumberFormat("mn-MN").format(payload[0].value as number)}
											</p>
										</div>
									);
								}}
								cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
							/>
							<Bar
								dataKey="revenue"
								fill="var(--color-primary)"
								radius={0}
								stroke="var(--color-border)"
								strokeWidth={1.5}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Pending Orders - Inline Expandable */}
			<div className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
					<div className="flex items-center gap-2">
						<Clock className="text-muted-foreground h-4 w-4" />
						<span className="text-sm font-bold">Хүлээгдэж буй</span>
					</div>
					<Badge className="font-mono text-xs" variant="secondary">
						{orders.length}
					</Badge>
				</div>

				{orders.length === 0 ? (
					<div className="text-muted-foreground p-6 text-center text-sm">Шинэ захиалга байхгүй</div>
				) : (
					<>
						<div className="divide-border divide-y">
							{displayedOrders.map((order) => (
								<Link
									className="active:bg-muted/20 flex items-center justify-between p-3"
									key={order.id}
									params={{ id: String(order.id) }}
									to="/orders/$id"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Badge className="shrink-0 font-mono text-[10px]" variant="surface">
												#{String(order.id).slice(-4)}
											</Badge>
											<span className="text-muted-foreground truncate text-xs">
												{formatDateToText(order.createdAt)}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-3 text-xs">
											<span className="flex items-center gap-1">
												<Phone className="text-muted-foreground h-3 w-3" />
												{order.customerPhone}
											</span>
										</div>
										<div className="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
											<MapPin className="h-2.5 w-2.5 shrink-0" />
											<span className="truncate">{order.address}</span>
										</div>
									</div>
									<div className="ml-2 text-right">
										<p className="font-heading text-sm font-black">
											₮{order.total.toLocaleString()}
										</p>
										<p className="text-muted-foreground text-[10px]">
											{order.products?.length || 0} бараа
										</p>
									</div>
								</Link>
							))}
						</div>

						{orders.length > 3 && (
							<button
								className="border-border bg-muted/20 active:bg-muted/40 flex w-full items-center justify-center gap-1 border-t-2 py-2.5 text-xs font-bold"
								onClick={() => setOrdersExpanded(!ordersExpanded)}
								type="button"
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
			<div className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
					<div className="flex items-center gap-2">
						<TrendingUp className="text-muted-foreground h-4 w-4" />
						<span className="text-sm font-bold">Топ бараа</span>
					</div>
					<span className="text-muted-foreground text-xs">Өнөөдөр</span>
				</div>

				{topProducts.length === 0 ? (
					<div className="text-muted-foreground p-6 text-center text-sm">Борлуулалт алга</div>
				) : (
					<div className="divide-border divide-y">
						{topProducts.map((product, index) => (
							<div className="flex items-center gap-3 p-2.5" key={product.name}>
								<div className="border-border bg-muted/50 font-heading flex h-7 w-7 shrink-0 items-center justify-center border-2 text-sm font-bold">
									{index + 1}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm leading-tight font-bold">{product.name}</p>
									<p className="text-muted-foreground text-[10px]">{product.totalSold} ширхэг</p>
								</div>
								<span className="shrink-0 font-mono text-xs font-bold">
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
