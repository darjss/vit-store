import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { timeRangeSchema } from "@vit/shared";
import {
	AlertTriangle,
	ArrowRight,
	Award,
	BarChart3,
	CheckCircle2,
	DollarSign,
	Package,
	Search,
	ShoppingCart,
	Target,
	TrendingDown,
	TrendingUp,
	Users,
	Warehouse,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import * as v from "valibot";
import { ProductPerformance } from "@/components/analytics/product-performance";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { AnalyticsPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
	pendingComponent: AnalyticsPageSkeleton,
	validateSearch: v.object({
		timeRange: v.optional(timeRangeSchema, "monthly"),
	}),
	loader: ({ context: ctx, location }) => {
		const timeRange =
			(location.search as { timeRange?: string })?.timeRange || "monthly";
		const tr = timeRange as "daily" | "weekly" | "monthly";

		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getAnalyticsData.queryOptions({ timeRange: tr }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getWebAnalytics.queryOptions({ timeRange: tr }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getConversionFunnel.queryOptions({ timeRange: tr }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getDailyVisitorTrend.queryOptions({ timeRange: tr }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getTopSearches.queryOptions({ timeRange: tr }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getMostViewedProducts.queryOptions({ timeRange: tr }),
		);
	},
});

const COLORS = [
	"var(--color-primary)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
];

const TIME_RANGE_LABELS = {
	daily: "Өнөөдөр",
	weekly: "7 хоног",
	monthly: "Сар",
} as const;

const TIME_RANGE_BUTTON_LABELS = {
	daily: "Өдөр",
	weekly: "7 хоног",
	monthly: "Сар",
} as const;

const STAT_INTENT_CLASSES = {
	neutral: "bg-muted text-muted-foreground",
	good: "bg-green-100 text-green-700",
	warn: "bg-primary text-primary-foreground",
	bad: "bg-red-100 text-red-700",
} as const;

function safePercent(value: number, total: number) {
	return total > 0 ? (value / total) * 100 : 0;
}

function formatPercent(value: number) {
	return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function findBiggestDrop(steps: Array<{ label: string; value: number }>) {
	let biggestDrop = { from: "", to: "", lost: 0 };
	for (let index = 1; index < steps.length; index++) {
		const previous = steps[index - 1];
		const current = steps[index];
		const lost = Math.max(previous.value - current.value, 0);
		if (lost > biggestDrop.lost) {
			biggestDrop = { from: previous.label, to: current.label, lost };
		}
	}
	return biggestDrop;
}

function CompactStat({
	label,
	value,
	caption,
	icon: Icon,
	intent = "neutral",
}: {
	label: string;
	value: string;
	caption: string;
	icon: typeof BarChart3;
	intent?: "neutral" | "good" | "warn" | "bad";
}) {
	const intentClass = STAT_INTENT_CLASSES[intent];

	return (
		<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
			<div className="flex items-center justify-between gap-2">
				<span className="font-black text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
					{label}
				</span>
				<span
					className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border ${intentClass}`}
				>
					<Icon className="h-3.5 w-3.5" />
				</span>
			</div>
			<p className="mt-2 font-black font-heading text-xl leading-none">{value}</p>
			<p className="mt-1 text-[11px] text-muted-foreground leading-tight">
				{caption}
			</p>
		</div>
	);
}

function SectionShell({
	title,
	caption,
	icon: Icon,
	children,
}: {
	title: string;
	caption?: string;
	icon: typeof BarChart3;
	children: React.ReactNode;
}) {
	return (
		<section className="border-2 border-border bg-card shadow-hard-sm">
			<div className="flex items-center justify-between gap-3 border-border border-b-2 bg-muted/30 px-3 py-2.5">
				<div className="flex min-w-0 items-center gap-2">
					<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
					<h2 className="truncate font-black font-heading text-sm">{title}</h2>
				</div>
				{caption && (
					<span className="shrink-0 text-muted-foreground text-xs">{caption}</span>
				)}
			</div>
			{children}
		</section>
	);
}

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

	const lowStockItems = data.lowInventoryProducts.slice(0, 4);
	const { count: failedCount, total: failedTotal } = data.failedPayments;
	const totalCategoryRevenue = categoryData.reduce((sum, cat) => sum + cat.value, 0);
	const topCategoryShare = safePercent(categoryData[0]?.value || 0, totalCategoryRevenue);
	const visitorToOrderRate = safePercent(funnel.orderPlacers, funnel.visitors);
	const viewToCartRate = safePercent(
		webAnalytics.current.addToCarts,
		webAnalytics.current.productViews,
	);
	const checkoutToPaymentRate = safePercent(
		funnel.paymentConfirmers,
		funnel.checkoutStarters,
	);
	const noResultSearches = topSearches.reduce(
		(sum, search) => sum + search.noResultCount,
		0,
	);
	const topSearchWithNoResults = topSearches.find(
		(search) => search.noResultCount > 0,
	);

	const funnelSteps = [
		{ label: "Зочин", value: funnel.visitors },
		{ label: "Бараа үзсэн", value: funnel.productViewers },
		{ label: "Сагсанд нэмсэн", value: funnel.cartAdders },
		{ label: "Төлбөр эхлүүлсэн", value: funnel.checkoutStarters },
		{ label: "Захиалга өгсөн", value: funnel.orderPlacers },
		{ label: "Төлбөр баталсан", value: funnel.paymentConfirmers },
	];
	const biggestDrop = findBiggestDrop(funnelSteps);
	const timeRangeLabel = TIME_RANGE_LABELS[tr];

	const stockCaption =
		data.metrics.lowStockCount > 0
			? `${data.metrics.lowStockCount} бараа дахин татах шаардлагатай`
			: "Агуулах хэвийн байна";

	return (
		<div className="space-y-3 pb-6">
			<header className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-start justify-between gap-3 border-border border-b-2 bg-primary p-3">
					<div className="min-w-0">
						<div className="mb-2 inline-flex items-center gap-1.5 border-2 border-border bg-card px-2 py-1 font-black text-[10px] uppercase tracking-[0.14em]">
							<BarChart3 className="h-3 w-3" />
							Дэлгүүрийн пульс
						</div>
						<h1 className="font-black font-heading text-2xl leading-none tracking-tight">
							Аналитик
						</h1>
						<p className="mt-1 max-w-[42ch] font-medium text-sm leading-snug">
							Юу зарагдаж байна, хаана алдаж байна, юуг өнөөдөр
							нөхөх вэ.
						</p>
					</div>
					<div className="flex shrink-0 border-2 border-border bg-card shadow-hard-sm">
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
								className={`px-3 py-2 font-black text-xs transition-colors active:translate-y-px ${
									timeRange === range
										? "bg-secondary text-secondary-foreground"
										: "bg-card hover:bg-muted"
								}`}
							>
								{TIME_RANGE_BUTTON_LABELS[range]}
							</button>
						))}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
					<CompactStat
						label="Зочин → захиалга"
						value={formatPercent(visitorToOrderRate)}
						caption={`${funnel.orderPlacers.toLocaleString()} захиалга, ${funnel.visitors.toLocaleString()} зочиноос`}
						icon={Target}
						intent={visitorToOrderRate >= 2 ? "good" : "warn"}
					/>
					<CompactStat
						label="Ашиг"
						value={formatCurrency(data.totalProfit)}
						caption={`${timeRangeLabel} хугацааны цэвэр ашиг`}
						icon={TrendingUp}
						intent="good"
					/>
					<CompactStat
						label="Дундаж сагс"
						value={formatCurrency(Math.round(data.averageOrderValue / 1000) * 1000)}
						caption="Нэг захиалгын дундаж дүн"
						icon={DollarSign}
					/>
					<CompactStat
						label="Агуулах"
						value={data.metrics.lowStockCount.toLocaleString()}
						caption={stockCaption}
						icon={Warehouse}
						intent={data.metrics.lowStockCount > 0 ? "bad" : "good"}
					/>
				</div>
			</header>

			<section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="border-2 border-border bg-card shadow-hard-sm">
					<div className="border-border border-b-2 bg-secondary px-3 py-2.5 text-secondary-foreground">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="h-4 w-4" />
								<h2 className="font-black font-heading text-sm">
									Өнөөдрийн шийдвэрүүд
								</h2>
							</div>
							<span className="font-mono text-[10px] opacity-80">
								{timeRangeLabel}
							</span>
						</div>
					</div>
					<div className="divide-y-2 divide-border">
						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="font-black text-sm">Хамгийн том алдагдал</p>
								<p className="mt-1 text-muted-foreground text-xs leading-snug">
									{biggestDrop.lost > 0
										? `${biggestDrop.from} → ${biggestDrop.to} алхамд ${biggestDrop.lost.toLocaleString()} хэрэглэгч алдагдсан.`
										: "Юүлүүрийн алхмууд тогтвортой байна."}
								</p>
							</div>
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								{formatPercent(checkoutToPaymentRate)} төлбөр баталсан
							</Badge>
						</div>

						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="font-black text-sm">Бараа үзэлт сагс болж байна уу?</p>
								<p className="mt-1 text-muted-foreground text-xs leading-snug">
									{formatPercent(viewToCartRate)} үзэлт сагсанд нэмэгдсэн. Топ үзэгдсэн
									бүтээгдэхүүнүүдийн үнэ, зураг, үлдэгдлийг шалга.
								</p>
							</div>
							<div className="flex items-center gap-1 font-black text-sm">
								<ShoppingCart className="h-4 w-4" />
								{webAnalytics.current.addToCarts.toLocaleString()}
							</div>
						</div>

						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="font-black text-sm">Хайлт юуг хэлж байна?</p>
								<p className="mt-1 text-muted-foreground text-xs leading-snug">
									{noResultSearches > 0 && topSearchWithNoResults
										? `"${topSearchWithNoResults.query}" хайлт үр дүнгүй байна. Нэршил, синоним эсвэл шинэ бараа нэмэх боломжтой.`
										: "Топ хайлтууд үр дүнтэй байна. Эрэлттэй үгсийг нүүр хуудас, категори дээр ашигла."}
								</p>
							</div>
							<div className="flex items-center gap-1 font-black text-sm">
								<Search className="h-4 w-4" />
								{noResultSearches.toLocaleString()}
							</div>
						</div>
					</div>
				</div>

				<div className="space-y-3">
					{failedCount > 0 && (
						<div className="border-2 border-red-500 bg-red-50 shadow-hard-sm">
							<div className="flex items-center gap-2 border-red-500 border-b-2 bg-red-100 px-3 py-2">
								<TrendingDown className="h-4 w-4 text-red-700" />
								<span className="font-black text-red-800 text-sm">
									Амжилтгүй төлбөр
								</span>
							</div>
							<div className="grid grid-cols-[auto_1fr] items-center gap-3 p-3">
								<p className="font-black font-heading text-4xl text-red-700 leading-none">
									{failedCount}
								</p>
								<div>
									<p className="font-black text-sm">{formatCurrency(failedTotal)}</p>
									<p className="text-red-700 text-xs">
										Дахин холбогдож төлбөр баталгаажуулах боломжтой.
									</p>
								</div>
							</div>
						</div>
					)}

					{lowStockItems.length > 0 && (
						<div className="border-2 border-border bg-primary shadow-hard-sm">
							<div className="flex items-center justify-between border-border border-b-2 px-3 py-2">
								<div className="flex items-center gap-2">
									<AlertTriangle className="h-4 w-4" />
									<span className="font-black text-sm">Дуусах гэж буй бараа</span>
								</div>
								<Link
									to="/products"
									className="flex items-center gap-1 font-black text-xs underline decoration-2 underline-offset-2"
								>
									Бүгд
									<ArrowRight className="h-3 w-3" />
								</Link>
							</div>
							<div className="divide-y-2 divide-border bg-card">
								{lowStockItems.map((item) => (
									<div
										key={item.productId}
										className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2.5"
									>
										{item.imageUrl ? (
											<img
												src={item.imageUrl}
												alt={item.name}
												className="h-10 w-10 border-2 border-border object-cover"
											/>
										) : (
											<div className="flex h-10 w-10 items-center justify-center border-2 border-border bg-muted">
												<Package className="h-4 w-4 text-muted-foreground" />
											</div>
										)}
										<div className="min-w-0">
											<p className="truncate font-black text-sm leading-tight">
												{item.name}
											</p>
											<p className="font-mono text-[10px] text-muted-foreground">
												{formatCurrency(item.price)}
											</p>
										</div>
										<Badge variant="outline" className="bg-primary font-black text-[10px]">
											{item.stock} үлдсэн
										</Badge>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</section>

			<section className="grid gap-3 lg:grid-cols-2">
				<SectionShell title="Ангиллын орлого" caption={timeRangeLabel} icon={BarChart3}>
					{categoryData.length > 0 ? (
						<div className="grid gap-3 p-3 sm:grid-cols-[140px_1fr] sm:items-center">
							<div className="mx-auto h-[140px] w-[140px]">
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={categoryData}
											cx="50%"
											cy="50%"
											innerRadius={34}
											outerRadius={64}
											paddingAngle={2}
											dataKey="value"
											stroke="var(--color-border)"
											strokeWidth={2}
										>
											{categoryData.map((cat, index) => (
												<Cell
													key={cat.name}
													fill={COLORS[index % COLORS.length]}
												/>
											))}
										</Pie>
										<Tooltip
											content={({ active, payload }) => {
												if (!active || !payload?.length) return null;
												return (
													<div className="border-2 border-border bg-card p-2 text-[10px] shadow-hard-sm">
														<p className="font-black">{payload[0].name}</p>
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
							<div className="space-y-2">
								<div className="border-2 border-border bg-primary p-2">
									<p className="font-black text-[10px] uppercase tracking-[0.12em]">
										Тэргүүлэх ангилал
									</p>
									<p className="mt-1 font-black font-heading text-xl leading-none">
										{categoryData[0]?.name}
									</p>
									<p className="mt-1 text-xs">
										{formatPercent(topCategoryShare)} нийт топ ангиллын орлого
									</p>
								</div>
								{categoryData.map((cat, i) => (
									<div key={cat.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
										<div
											className="h-3 w-3 border border-border"
											style={{ backgroundColor: COLORS[i % COLORS.length] }}
										/>
										<span className="truncate font-bold">{cat.name}</span>
										<span className="font-mono text-muted-foreground">
											₮{(cat.value / 1000).toFixed(0)}k
										</span>
									</div>
								))}
							</div>
						</div>
					) : (
						<div className="p-6 text-center text-muted-foreground text-sm">
							Ангиллын борлуулалтын өгөгдөл байхгүй.
						</div>
					)}
				</SectionShell>

				<SectionShell title="Брэндийн хүч" caption={timeRangeLabel} icon={Award}>
					{brandData.length > 0 ? (
						<div className="divide-y-2 divide-border">
							{brandData.map((brand, index) => {
								const maxRevenue = brandData[0]?.revenue || 1;
								const percentage = safePercent(brand.revenue, maxRevenue);
								return (
									<div key={brand.name} className="p-3">
										<div className="mb-2 flex items-center justify-between gap-3">
											<div className="flex min-w-0 items-center gap-2">
												<div className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border bg-primary font-black font-heading text-xs">
													{index + 1}
												</div>
												<div className="min-w-0">
													<p className="truncate font-black text-sm leading-tight">
														{brand.name}
													</p>
													<p className="text-[10px] text-muted-foreground">
														{brand.qty} ширхэг зарагдсан
													</p>
												</div>
											</div>
											<span className="shrink-0 font-black font-mono text-xs">
												₮{(brand.revenue / 1000).toFixed(0)}k
											</span>
										</div>
										<div className="h-3 border-2 border-border bg-muted">
											<div
												className="h-full border-border border-r-2 bg-primary"
												style={{ width: `${percentage}%` }}
											/>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="p-6 text-center text-muted-foreground text-sm">
							Брэндийн борлуулалтын өгөгдөл байхгүй.
						</div>
					)}
				</SectionShell>
			</section>

			<WebAnalytics
				webAnalytics={webAnalytics}
				funnel={funnel}
				dailyTrend={dailyTrend}
				timeRangeLabel={timeRangeLabel}
			/>

			<ProductPerformance
				mostViewedProducts={mostViewedProducts}
				topSearches={topSearches}
				timeRangeLabel={timeRangeLabel}
			/>

			<div className="grid grid-cols-2 gap-2">
				<CompactStat
					label="Давтан худалдан авагч"
					value={data.repeatCustomers.toLocaleString()}
					caption="Ижил хугацаанд дахин захиалсан хэрэглэгч"
					icon={Users}
				/>
				<CompactStat
					label="Барааны үнэлгээ"
					value={`${data.metrics.currentProductsValue.toLocaleString("en-US")}₮`}
					caption="Одоогийн агуулахын нийт үнэ"
					icon={Package}
				/>
			</div>
		</div>
	);
}
