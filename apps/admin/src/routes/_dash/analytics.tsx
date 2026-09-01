import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { timeRangeSchema } from "@vit/shared";
import type { timeRangeType } from "@vit/shared";
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
import { chartTooltipNumber } from "@/lib/chart-tooltip";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const analyticsSearchSchema = v.object({
	timeRange: v.optional(timeRangeSchema, "monthly"),
});

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
	loader: ({ context: ctx, location }) => {
		const search = v.parse(analyticsSearchSchema, location.search);
		const timeRange = search.timeRange ?? "monthly";

		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getAnalyticsData.queryOptions({ timeRange }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getWebAnalytics.queryOptions({ timeRange }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getConversionFunnel.queryOptions({ timeRange }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getDailyVisitorTrend.queryOptions({ timeRange }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getTopSearches.queryOptions({ timeRange }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getMostViewedProducts.queryOptions({ timeRange }),
		);
	},
	pendingComponent: AnalyticsPageSkeleton,
	validateSearch: analyticsSearchSchema,
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
	monthly: "Сар",
	weekly: "7 хоног",
} as const;

const TIME_RANGE_BUTTON_LABELS = {
	daily: "Өдөр",
	monthly: "Сар",
	weekly: "7 хоног",
} as const;

const STAT_INTENT_CLASSES = {
	bad: "bg-red-100 text-red-700",
	good: "bg-green-100 text-green-700",
	neutral: "bg-muted text-muted-foreground",
	warn: "bg-primary text-primary-foreground",
} as const;

function safePercent(value: number, total: number) {
	return total > 0 ? (value / total) * 100 : 0;
}

function formatPercent(value: number) {
	return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function findBiggestDrop(steps: Array<{ label: string; value: number }>) {
	let biggestDrop = { from: "", lost: 0, to: "" };
	for (let index = 1; index < steps.length; index++) {
		const previous = steps[index - 1];
		const current = steps[index];
		const lost = Math.max(previous.value - current.value, 0);
		if (lost > biggestDrop.lost) {
			biggestDrop = { from: previous.label, lost, to: current.label };
		}
	}
	return biggestDrop;
}

function CompactStat({
	caption,
	icon: Icon,
	intent = "neutral",
	label,
	value,
}: {
	caption: string;
	icon: typeof BarChart3;
	intent?: "neutral" | "good" | "warn" | "bad";
	label: string;
	value: string;
}) {
	const intentClass = STAT_INTENT_CLASSES[intent];

	return (
		<div className="border-border bg-card shadow-hard-sm border-2 p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
					{label}
				</span>
				<span
					className={`border-border flex h-7 w-7 shrink-0 items-center justify-center border-2 ${intentClass}`}
				>
					<Icon className="h-3.5 w-3.5" />
				</span>
			</div>
			<p className="font-heading mt-2 text-xl leading-none font-black">{value}</p>
			<p className="text-muted-foreground mt-1 text-[11px] leading-tight">{caption}</p>
		</div>
	);
}

function SectionShell({
	caption,
	children,
	icon: Icon,
	title,
}: {
	caption?: string;
	children: React.ReactNode;
	icon: typeof BarChart3;
	title: string;
}) {
	return (
		<section className="border-border bg-card shadow-hard-sm border-2">
			<div className="border-border bg-muted/30 flex items-center justify-between gap-3 border-b-2 px-3 py-2.5">
				<div className="flex min-w-0 items-center gap-2">
					<Icon className="text-muted-foreground h-4 w-4 shrink-0" />
					<h2 className="font-heading truncate text-sm font-black">{title}</h2>
				</div>
				{caption && <span className="text-muted-foreground shrink-0 text-xs">{caption}</span>}
			</div>
			{children}
		</section>
	);
}

function RouteComponent() {
	const { timeRange = "monthly" } = Route.useSearch();
	const navigate = useNavigate({ from: "/analytics" });
	const tr: timeRangeType = timeRange;

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
			qty: brand.quantity,
			revenue: brand.total,
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
	const checkoutToPaymentRate = safePercent(funnel.paymentConfirmers, funnel.checkoutStarters);
	const noResultSearches = topSearches.reduce((sum, search) => sum + search.noResultCount, 0);
	const topSearchWithNoResults = topSearches.find((search) => search.noResultCount > 0);

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
			<header className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-primary flex items-start justify-between gap-3 border-b-2 p-3">
					<div className="min-w-0">
						<div className="border-border bg-card mb-2 inline-flex items-center gap-1.5 border-2 px-2 py-1 text-[10px] font-black tracking-[0.14em] uppercase">
							<BarChart3 className="h-3 w-3" />
							Дэлгүүрийн пульс
						</div>
						<h1 className="font-heading text-2xl leading-none font-black tracking-tight">
							Аналитик
						</h1>
						<p className="mt-1 max-w-[42ch] text-sm leading-snug font-medium">
							Юу зарагдаж байна, хаана алдаж байна, юуг өнөөдөр нөхөх вэ.
						</p>
					</div>
					<div className="border-border bg-card shadow-hard-sm flex shrink-0 border-2">
						{(["daily", "weekly", "monthly"] as const).map((range) => (
							<button
								className={`px-3 py-2 text-xs font-black transition-colors active:translate-y-px ${
									timeRange === range
										? "bg-secondary text-secondary-foreground"
										: "bg-card hover:bg-muted"
								}`}
								key={range}
								onClick={() =>
									navigate({
										search: { timeRange: range },
										to: "/analytics",
									})
								}
								type="button"
							>
								{TIME_RANGE_BUTTON_LABELS[range]}
							</button>
						))}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
					<CompactStat
						caption={`${funnel.orderPlacers.toLocaleString()} захиалга, ${funnel.visitors.toLocaleString()} зочиноос`}
						icon={Target}
						intent={visitorToOrderRate >= 2 ? "good" : "warn"}
						label="Зочин → захиалга"
						value={formatPercent(visitorToOrderRate)}
					/>
					<CompactStat
						caption={`${timeRangeLabel} хугацааны цэвэр ашиг`}
						icon={TrendingUp}
						intent="good"
						label="Ашиг"
						value={formatCurrency(data.totalProfit)}
					/>
					<CompactStat
						caption="Нэг захиалгын дундаж дүн"
						icon={DollarSign}
						label="Дундаж сагс"
						value={formatCurrency(Math.round(data.averageOrderValue / 1000) * 1000)}
					/>
					<CompactStat
						caption={stockCaption}
						icon={Warehouse}
						intent={data.metrics.lowStockCount > 0 ? "bad" : "good"}
						label="Агуулах"
						value={data.metrics.lowStockCount.toLocaleString()}
					/>
				</div>
			</header>

			<section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="border-border bg-card shadow-hard-sm border-2">
					<div className="border-border bg-secondary text-secondary-foreground border-b-2 px-3 py-2.5">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="h-4 w-4" />
								<h2 className="font-heading text-sm font-black">Өнөөдрийн шийдвэрүүд</h2>
							</div>
							<span className="font-mono text-[10px] opacity-80">{timeRangeLabel}</span>
						</div>
					</div>
					<div className="divide-border divide-y-2">
						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="text-sm font-black">Хамгийн том алдагдал</p>
								<p className="text-muted-foreground mt-1 text-xs leading-snug">
									{biggestDrop.lost > 0
										? `${biggestDrop.from} → ${biggestDrop.to} алхамд ${biggestDrop.lost.toLocaleString()} хэрэглэгч алдагдсан.`
										: "Юүлүүрийн алхмууд тогтвортой байна."}
								</p>
							</div>
							<Badge className="w-fit font-mono text-xs" variant="secondary">
								{formatPercent(checkoutToPaymentRate)} төлбөр баталсан
							</Badge>
						</div>

						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="text-sm font-black">Бараа үзэлт сагс болж байна уу?</p>
								<p className="text-muted-foreground mt-1 text-xs leading-snug">
									{formatPercent(viewToCartRate)} үзэлт сагсанд нэмэгдсэн. Топ үзэгдсэн
									бүтээгдэхүүнүүдийн үнэ, зураг, үлдэгдлийг шалга.
								</p>
							</div>
							<div className="flex items-center gap-1 text-sm font-black">
								<ShoppingCart className="h-4 w-4" />
								{webAnalytics.current.addToCarts.toLocaleString()}
							</div>
						</div>

						<div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								<p className="text-sm font-black">Хайлт юуг хэлж байна?</p>
								<p className="text-muted-foreground mt-1 text-xs leading-snug">
									{noResultSearches > 0 && topSearchWithNoResults
										? `"${topSearchWithNoResults.query}" хайлт үр дүнгүй байна. Нэршил, синоним эсвэл шинэ бараа нэмэх боломжтой.`
										: "Топ хайлтууд үр дүнтэй байна. Эрэлттэй үгсийг нүүр хуудас, категори дээр ашигла."}
								</p>
							</div>
							<div className="flex items-center gap-1 text-sm font-black">
								<Search className="h-4 w-4" />
								{noResultSearches.toLocaleString()}
							</div>
						</div>
					</div>
				</div>

				<div className="space-y-3">
					{failedCount > 0 && (
						<div className="shadow-hard-sm border-2 border-red-500 bg-red-50">
							<div className="flex items-center gap-2 border-b-2 border-red-500 bg-red-100 px-3 py-2">
								<TrendingDown className="h-4 w-4 text-red-700" />
								<span className="text-sm font-black text-red-800">Амжилтгүй төлбөр</span>
							</div>
							<div className="grid grid-cols-[auto_1fr] items-center gap-3 p-3">
								<p className="font-heading text-4xl leading-none font-black text-red-700">
									{failedCount}
								</p>
								<div>
									<p className="text-sm font-black">{formatCurrency(failedTotal)}</p>
									<p className="text-xs text-red-700">
										Дахин холбогдож төлбөр баталгаажуулах боломжтой.
									</p>
								</div>
							</div>
						</div>
					)}

					{lowStockItems.length > 0 && (
						<div className="border-border bg-primary shadow-hard-sm border-2">
							<div className="border-border flex items-center justify-between border-b-2 px-3 py-2">
								<div className="flex items-center gap-2">
									<AlertTriangle className="h-4 w-4" />
									<span className="text-sm font-black">Дуусах гэж буй бараа</span>
								</div>
								<Link
									className="flex items-center gap-1 text-xs font-black underline decoration-2 underline-offset-2"
									to="/products"
								>
									Бүгд
									<ArrowRight className="h-3 w-3" />
								</Link>
							</div>
							<div className="divide-border bg-card divide-y-2">
								{lowStockItems.map((item) => (
									<div
										className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2.5"
										key={item.productId}
									>
										{item.imageUrl ? (
											<img
												alt={item.name}
												className="border-border h-10 w-10 border-2 object-cover"
												src={item.imageUrl}
											/>
										) : (
											<div className="border-border bg-muted flex h-10 w-10 items-center justify-center border-2">
												<Package className="text-muted-foreground h-4 w-4" />
											</div>
										)}
										<div className="min-w-0">
											<p className="truncate text-sm leading-tight font-black">{item.name}</p>
											<p className="text-muted-foreground font-mono text-[10px]">
												{formatCurrency(item.price)}
											</p>
										</div>
										<Badge className="bg-primary text-[10px] font-black" variant="outline">
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
				<SectionShell caption={timeRangeLabel} icon={BarChart3} title="Ангиллын орлого">
					{categoryData.length > 0 ? (
						<div className="grid gap-3 p-3 sm:grid-cols-[140px_1fr] sm:items-center">
							<div className="mx-auto h-[140px] w-[140px]">
								<ResponsiveContainer height="100%" width="100%">
									<PieChart>
										<Pie
											cx="50%"
											cy="50%"
											data={categoryData}
											dataKey="value"
											innerRadius={34}
											outerRadius={64}
											paddingAngle={2}
											stroke="var(--color-border)"
											strokeWidth={2}
										>
											{categoryData.map((cat, index) => (
												<Cell fill={COLORS[index % COLORS.length]} key={cat.name} />
											))}
										</Pie>
										<Tooltip
											content={({ active, payload }) => {
												if (!active || !payload?.length) {
													return null;
												}
												return (
													<div className="border-border bg-card shadow-hard-sm border-2 p-2 text-[10px]">
														<p className="font-black">{payload[0].name}</p>
														<p className="font-mono">
															{formatCurrency(chartTooltipNumber(payload[0]?.value))}
														</p>
													</div>
												);
											}}
										/>
									</PieChart>
								</ResponsiveContainer>
							</div>
							<div className="space-y-2">
								<div className="border-border bg-primary border-2 p-2">
									<p className="text-[10px] font-black tracking-[0.12em] uppercase">
										Тэргүүлэх ангилал
									</p>
									<p className="font-heading mt-1 text-xl leading-none font-black">
										{categoryData[0]?.name}
									</p>
									<p className="mt-1 text-xs">
										{formatPercent(topCategoryShare)} нийт топ ангиллын орлого
									</p>
								</div>
								{categoryData.map((cat, i) => (
									<div
										className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"
										key={cat.name}
									>
										<div
											className="border-border h-3 w-3 border"
											style={{ backgroundColor: COLORS[i % COLORS.length] }}
										/>
										<span className="truncate font-bold">{cat.name}</span>
										<span className="text-muted-foreground font-mono">
											₮{(cat.value / 1000).toFixed(0)}k
										</span>
									</div>
								))}
							</div>
						</div>
					) : (
						<div className="text-muted-foreground p-6 text-center text-sm">
							Ангиллын борлуулалтын өгөгдөл байхгүй.
						</div>
					)}
				</SectionShell>

				<SectionShell caption={timeRangeLabel} icon={Award} title="Брэндийн хүч">
					{brandData.length > 0 ? (
						<div className="divide-border divide-y-2">
							{brandData.map((brand, index) => {
								const maxRevenue = brandData[0]?.revenue || 1;
								const percentage = safePercent(brand.revenue, maxRevenue);
								return (
									<div className="p-3" key={brand.name}>
										<div className="mb-2 flex items-center justify-between gap-3">
											<div className="flex min-w-0 items-center gap-2">
												<div className="border-border bg-primary font-heading flex h-7 w-7 shrink-0 items-center justify-center border-2 text-xs font-black">
													{index + 1}
												</div>
												<div className="min-w-0">
													<p className="truncate text-sm leading-tight font-black">{brand.name}</p>
													<p className="text-muted-foreground text-[10px]">
														{brand.qty} ширхэг зарагдсан
													</p>
												</div>
											</div>
											<span className="shrink-0 font-mono text-xs font-black">
												₮{(brand.revenue / 1000).toFixed(0)}k
											</span>
										</div>
										<div className="border-border bg-muted h-3 border-2">
											<div
												className="border-border bg-primary h-full border-r-2"
												style={{ width: `${percentage}%` }}
											/>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-muted-foreground p-6 text-center text-sm">
							Брэндийн борлуулалтын өгөгдөл байхгүй.
						</div>
					)}
				</SectionShell>
			</section>

			<WebAnalytics
				dailyTrend={dailyTrend}
				funnel={funnel}
				timeRangeLabel={timeRangeLabel}
				webAnalytics={webAnalytics}
			/>

			<ProductPerformance
				mostViewedProducts={mostViewedProducts}
				timeRangeLabel={timeRangeLabel}
				topSearches={topSearches}
			/>

			<div className="grid grid-cols-2 gap-2">
				<CompactStat
					caption="Ижил хугацаанд дахин захиалсан хэрэглэгч"
					icon={Users}
					label="Давтан худалдан авагч"
					value={data.repeatCustomers.toLocaleString()}
				/>
				<CompactStat
					caption="Одоогийн агуулахын нийт үнэ"
					icon={Package}
					label="Барааны үнэлгээ"
					value={`${data.metrics.currentProductsValue.toLocaleString("en-US")}₮`}
				/>
			</div>
		</div>
	);
}
