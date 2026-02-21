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
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface WebAnalyticsData {
	current: {
		uniqueVisitors: number;
		pageviews: number;
		productViews: number;
		addToCarts: number;
		checkouts: number;
		orders: number;
		payments: number;
		searches: number;
	};
	changes: {
		visitors: number;
		pageviews: number;
		orders: number;
	};
}

interface ConversionFunnelData {
	visitors: number;
	productViewers: number;
	cartAdders: number;
	checkoutStarters: number;
	orderPlacers: number;
	paymentConfirmers: number;
}

interface DailyTrendData {
	date: string;
	visitors: number;
	pageviews: number;
	orders: number;
}

interface WebAnalyticsProps {
	webAnalytics: WebAnalyticsData;
	funnel: ConversionFunnelData;
	dailyTrend: DailyTrendData[];
	timeRangeLabel: string;
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
	webAnalytics,
	funnel,
	dailyTrend,
	timeRangeLabel,
}: WebAnalyticsProps) {
	const { current, changes } = webAnalytics;

	const funnelSteps = [
		{ label: "Зочин", count: funnel.visitors, icon: Users },
		{ label: "Бараа үзсэн", count: funnel.productViewers, icon: Eye },
		{ label: "Сагсанд нэмсэн", count: funnel.cartAdders, icon: ShoppingCart },
		{
			label: "Төлбөр эхлүүлсэн",
			count: funnel.checkoutStarters,
			icon: Target,
		},
		{
			label: "Захиалга өгсөн",
			count: funnel.orderPlacers,
			icon: ShoppingBag,
		},
		{
			label: "Төлбөр баталсан",
			count: funnel.paymentConfirmers,
			icon: MousePointer,
		},
	];

	const funnelWithRates = funnelSteps.map((step, i) => {
		const prevCount = i > 0 ? funnelSteps[i - 1].count : step.count;
		const rate =
			prevCount > 0 ? Math.round((step.count / prevCount) * 1000) / 10 : 0;
		return { ...step, rate: i === 0 ? 100 : rate };
	});

	const chartData = dailyTrend.map((d) => {
		const date = new Date(d.date);
		return {
			label: `${date.getMonth() + 1}/${date.getDate()}`,
			visitors: d.visitors,
			pageviews: d.pageviews,
			orders: d.orders,
		};
	});

	return (
		<div className="space-y-3">
			{/* Overview Cards - 2x2 */}
			<div className="grid grid-cols-2 gap-2">
				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Users className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Зочин
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{current.uniqueVisitors.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.visitors} />
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Eye className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Хуудас үзэлт
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{current.pageviews.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.pageviews} />
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<ShoppingBag className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Захиалга
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{current.orders.toLocaleString()}
					</p>
					<ChangeIndicator value={changes.orders} />
				</div>

				<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Search className="h-3.5 w-3.5" />
						<span className="font-bold text-[10px] uppercase tracking-wide">
							Хайлт
						</span>
					</div>
					<p className="mt-1 font-black font-heading text-lg leading-tight">
						{current.searches.toLocaleString()}
					</p>
				</div>
			</div>

			{/* Daily Trend Chart */}
			{chartData.length > 0 && (
				<div className="border-2 border-border bg-card shadow-hard-sm">
					<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
						<div className="flex items-center gap-2">
							<Eye className="h-4 w-4 text-muted-foreground" />
							<span className="font-bold text-sm">
								Зочин болон захиалгын чиг хандлага
							</span>
						</div>
						<span className="text-muted-foreground text-xs">
							{timeRangeLabel}
						</span>
					</div>
					<div className="p-3">
						<div className="h-[160px] w-full">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={chartData}
									margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
								>
									<XAxis
										dataKey="label"
										tick={{ fontSize: 9, fontWeight: 600 }}
										tickLine={false}
										axisLine={false}
									/>
									<YAxis
										tick={{ fontSize: 9 }}
										tickLine={false}
										axisLine={false}
										width={30}
									/>
									<Tooltip
										content={({ active, payload, label }) => {
											if (!active || !payload?.length) return null;
											return (
												<div className="border-2 border-border bg-card p-1.5 text-[10px] shadow-hard-sm">
													<p className="font-bold">{label}</p>
													<p>
														<span className="text-muted-foreground">
															Зочин:{" "}
														</span>
														<span className="font-mono">
															{(payload[0]?.value as number)?.toLocaleString()}
														</span>
													</p>
													<p>
														<span className="text-muted-foreground">
															Захиалга:{" "}
														</span>
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
										stroke="var(--color-border)"
										strokeWidth={1.5}
										radius={0}
									/>
									<Bar
										dataKey="orders"
										fill="var(--color-chart-2)"
										stroke="var(--color-border)"
										strokeWidth={1.5}
										radius={0}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
						<div className="mt-2 flex items-center justify-center gap-4 text-[10px]">
							<div className="flex items-center gap-1">
								<div className="h-2.5 w-2.5 border border-border bg-primary" />
								<span className="text-muted-foreground">Зочин</span>
							</div>
							<div className="flex items-center gap-1">
								<div
									className="h-2.5 w-2.5 border border-border"
									style={{ backgroundColor: "var(--color-chart-2)" }}
								/>
								<span className="text-muted-foreground">Захиалга</span>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Conversion Funnel */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<Target className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Хөрвүүлэлтийн юүлүүр</span>
					</div>
					<span className="text-muted-foreground text-xs">
						{timeRangeLabel}
					</span>
				</div>
				<div className="divide-y divide-border">
					{funnelWithRates.map((step, index) => {
						const Icon = step.icon;
						const widthPct =
							funnel.visitors > 0
								? Math.max((step.count / funnel.visitors) * 100, 5)
								: 5;
						return (
							<div key={step.label} className="relative p-2.5">
								<div
									className="absolute inset-y-0 left-0 bg-primary/10"
									style={{ width: `${widthPct}%` }}
								/>
								<div className="relative flex items-center justify-between">
									<div className="flex items-center gap-2.5">
										<div className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-border bg-card">
											<Icon className="h-3 w-3" />
										</div>
										<div>
											<p className="font-bold text-sm leading-tight">
												{step.label}
											</p>
											{index > 0 && (
												<p className="text-[10px] text-muted-foreground">
													{step.rate}% өмнөх алхмаас
												</p>
											)}
										</div>
									</div>
									<span className="shrink-0 font-bold font-mono text-xs">
										{step.count.toLocaleString()}
									</span>
								</div>
							</div>
						);
					})}
				</div>
				{funnel.visitors > 0 && (
					<div className="border-border border-t-2 bg-muted/20 px-3 py-2">
						<div className="flex items-center justify-between text-xs">
							<span className="font-medium text-muted-foreground">
								Нийт хөрвүүлэлт (Зочин → Захиалга)
							</span>
							<span className="font-black font-heading">
								{((funnel.orderPlacers / funnel.visitors) * 100).toFixed(1)}%
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Quick Event Stats */}
			<div className="grid grid-cols-3 gap-2">
				<div className="border-2 border-border bg-card p-2.5 shadow-hard-sm">
					<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
						Бараа үзэлт
					</p>
					<p className="mt-0.5 font-black font-heading text-base leading-tight">
						{current.productViews.toLocaleString()}
					</p>
				</div>
				<div className="border-2 border-border bg-card p-2.5 shadow-hard-sm">
					<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
						Сагсанд нэмсэн
					</p>
					<p className="mt-0.5 font-black font-heading text-base leading-tight">
						{current.addToCarts.toLocaleString()}
					</p>
				</div>
				<div className="border-2 border-border bg-card p-2.5 shadow-hard-sm">
					<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
						Төлбөр баталсан
					</p>
					<p className="mt-0.5 font-black font-heading text-base leading-tight">
						{current.payments.toLocaleString()}
					</p>
				</div>
			</div>
		</div>
	);
}
