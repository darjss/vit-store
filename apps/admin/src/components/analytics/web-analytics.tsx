import {
	ArrowDownRight,
	ArrowUpRight,
	Eye,
	MousePointer,
	Search,
	ShoppingBag,
	ShoppingCart,
	Target,
	Users,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface WebAnalyticsData {
	changes: {
		orders: number;
		pageviews: number;
		visitors: number;
	};
	current: {
		addToCarts: number;
		checkouts: number;
		orders: number;
		pageviews: number;
		payments: number;
		productViews: number;
		searches: number;
		uniqueVisitors: number;
	};
}

interface ConversionFunnelData {
	cartAdders: number;
	checkoutStarters: number;
	orderPlacers: number;
	paymentConfirmers: number;
	productViewers: number;
	visitors: number;
}

interface DailyTrendData {
	date: string;
	orders: number;
	pageviews: number;
	visitors: number;
}

interface WebAnalyticsProps {
	dailyTrend: Array<DailyTrendData>;
	funnel: ConversionFunnelData;
	timeRangeLabel: string;
	webAnalytics: WebAnalyticsData;
}

function ChangeIndicator({ value }: { value: number }) {
	const isPositive = value >= 0;
	const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
	return (
		<div className="mt-1 flex items-center gap-0.5 text-[10px]">
			<span
				className={`flex items-center font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}
			>
				<Icon className="h-2.5 w-2.5" />
				{Math.abs(value)}%
			</span>
		</div>
	);
}

export function WebAnalytics({
	dailyTrend,
	funnel,
	timeRangeLabel,
	webAnalytics,
}: WebAnalyticsProps) {
	const { changes, current } = webAnalytics;

	const funnelSteps = [
		{ count: funnel.visitors, icon: Users, label: "Зочин" },
		{ count: funnel.productViewers, icon: Eye, label: "Бараа үзсэн" },
		{ count: funnel.cartAdders, icon: ShoppingCart, label: "Сагсанд нэмсэн" },
		{
			count: funnel.checkoutStarters,
			icon: Target,
			label: "Төлбөр эхлүүлсэн",
		},
		{
			count: funnel.orderPlacers,
			icon: ShoppingBag,
			label: "Захиалга өгсөн",
		},
		{
			count: funnel.paymentConfirmers,
			icon: MousePointer,
			label: "Төлбөр баталсан",
		},
	];

	const funnelWithRates = funnelSteps.map((step, i) => {
		const prevCount = i > 0 ? funnelSteps[i - 1].count : step.count;
		const rate = prevCount > 0 ? Math.round((step.count / prevCount) * 1000) / 10 : 0;
		return { ...step, rate: i === 0 ? 100 : rate };
	});

	const chartData = dailyTrend.map((d) => {
		const date = new Date(d.date);
		return {
			label: `${date.getMonth() + 1}/${date.getDate()}`,
			orders: d.orders,
			pageviews: d.pageviews,
			visitors: d.visitors,
		};
	});

	return (
		<div className="space-y-3">
			{/* Overview Cards - 2x2 */}
			<div className="grid grid-cols-2 gap-2">
				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Users className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Зочин</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
						{current.uniqueVisitors.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.visitors} />
				</div>

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Eye className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Хуудас үзэлт</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
						{current.pageviews.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.pageviews} />
				</div>

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<ShoppingBag className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Захиалга</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
						{current.orders.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.orders} />
				</div>

				<div className="border-border bg-card shadow-hard-sm border-2 p-3">
					<div className="text-muted-foreground flex items-center gap-1.5">
						<Search className="h-3.5 w-3.5" />
						<span className="text-[10px] font-bold tracking-wide uppercase">Хайлт</span>
					</div>
					<p className="font-heading mt-1 text-lg leading-tight font-black">
						{current.searches.toLocaleString()}
					</p>
				</div>
			</div>

			{/* Daily Trend Chart */}
			{chartData.length > 0 && (
				<div className="border-border bg-card shadow-hard-sm border-2">
					<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
						<div className="flex items-center gap-2">
							<Eye className="text-muted-foreground h-4 w-4" />
							<span className="text-sm font-bold">Зочин болон захиалгын чиг хандлага</span>
						</div>
						<span className="text-muted-foreground text-xs">{timeRangeLabel}</span>
					</div>
					<div className="p-3">
						<div className="h-[160px] w-full">
							<ResponsiveContainer height="100%" width="100%">
								<BarChart data={chartData} margin={{ bottom: 0, left: 0, right: 5, top: 5 }}>
									<XAxis
										axisLine={false}
										dataKey="label"
										tick={{ fontSize: 9, fontWeight: 600 }}
										tickLine={false}
									/>
									<YAxis axisLine={false} tick={{ fontSize: 9 }} tickLine={false} width={30} />
									<Tooltip
										content={({ active, label, payload }) => {
											if (!active || !payload?.length) {
												return null;
											}
											return (
												<div className="border-border bg-card shadow-hard-sm border-2 p-1.5 text-[10px]">
													<p className="font-bold">{label}</p>
													<p>
														<span className="text-muted-foreground">Зочин: </span>
														<span className="font-mono">
															{(payload[0]?.value as number)?.toLocaleString()}
														</span>
													</p>
													<p>
														<span className="text-muted-foreground">Захиалга: </span>
														<span className="font-mono">
															{(payload[1]?.value as number)?.toLocaleString()}
														</span>
													</p>
												</div>
											);
										}}
									/>
									<Bar
										dataKey="visitors"
										fill="var(--color-primary)"
										radius={0}
										stroke="var(--color-border)"
										strokeWidth={1.5}
									/>
									<Bar
										dataKey="orders"
										fill="var(--color-chart-2)"
										radius={0}
										stroke="var(--color-border)"
										strokeWidth={1.5}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
						<div className="mt-2 flex items-center justify-center gap-4 text-[10px]">
							<div className="flex items-center gap-1">
								<div className="border-border bg-primary h-2.5 w-2.5 border" />
								<span className="text-muted-foreground">Зочин</span>
							</div>
							<div className="flex items-center gap-1">
								<div
									className="border-border h-2.5 w-2.5 border"
									style={{ backgroundColor: "var(--color-chart-2)" }}
								/>
								<span className="text-muted-foreground">Захиалга</span>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Conversion Funnel */}
			<div className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
					<div className="flex items-center gap-2">
						<Target className="text-muted-foreground h-4 w-4" />
						<span className="text-sm font-bold">Хөрвүүлэлтийн юүлүүр</span>
					</div>
					<span className="text-muted-foreground text-xs">{timeRangeLabel}</span>
				</div>
				<div className="divide-border divide-y">
					{funnelWithRates.map((step, index) => {
						const Icon = step.icon;
						const widthPct =
							funnel.visitors > 0 ? Math.max((step.count / funnel.visitors) * 100, 5) : 5;
						return (
							<div className="relative p-2.5" key={step.label}>
								<div
									className="bg-primary/10 absolute inset-y-0 left-0"
									style={{ width: `${widthPct}%` }}
								/>
								<div className="relative flex items-center justify-between">
									<div className="flex items-center gap-2.5">
										<div className="border-border bg-card flex h-6 w-6 shrink-0 items-center justify-center border-2">
											<Icon className="h-3 w-3" />
										</div>
										<div>
											<p className="text-sm leading-tight font-bold">{step.label}</p>
											{index > 0 && (
												<p className="text-muted-foreground text-[10px]">
													{step.rate}% өмнөх алхмаас
												</p>
											)}
										</div>
									</div>
									<span className="shrink-0 font-mono text-xs font-bold">
										{step.count.toLocaleString()}
									</span>
								</div>
							</div>
						);
					})}
				</div>
				{funnel.visitors > 0 && (
					<div className="border-border bg-muted/20 border-t-2 px-3 py-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground font-medium">
								Нийт хөрвүүлэлт (Зочин → Захиалга)
							</span>
							<span className="font-heading font-black">
								{((funnel.orderPlacers / funnel.visitors) * 100).toFixed(1)}%
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Quick Event Stats */}
			<div className="grid grid-cols-3 gap-2">
				<div className="border-border bg-card shadow-hard-sm border-2 p-2.5">
					<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
						Бараа үзэлт
					</p>
					<p className="font-heading mt-0.5 text-base leading-tight font-black">
						{current.productViews.toLocaleString()}
					</p>
				</div>
				<div className="border-border bg-card shadow-hard-sm border-2 p-2.5">
					<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
						Сагсанд нэмсэн
					</p>
					<p className="font-heading mt-0.5 text-base leading-tight font-black">
						{current.addToCarts.toLocaleString()}
					</p>
				</div>
				<div className="border-border bg-card shadow-hard-sm border-2 p-2.5">
					<p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
						Төлбөр баталсан
					</p>
					<p className="font-heading mt-0.5 text-base leading-tight font-black">
						{current.payments.toLocaleString()}
					</p>
				</div>
			</div>
		</div>
	);
}
