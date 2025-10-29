import { Eye, MousePointer, Target, TrendingUp } from "lucide-react";
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";

export function WebAnalytics() {
	const visitorData = [
		{
			period: "Өнөөдөр",
			visitors: mockData.dailyVisits,
			orders: mockData.dailyOrders,
		},
		{
			period: "7 хоног",
			visitors: mockData.weeklyVisits,
			orders: mockData.weeklyOrders,
		},
		{
			period: "Сар",
			visitors: mockData.monthlyVisits,
			orders: mockData.monthlyOrders,
		},
	];

	const conversionData = [
		{
			metric: "Зочин → Захиалга",
			rate: mockData.conversionMetrics.visitorToOrderRate,
		},
		{
			metric: "Сагс → Захиалга",
			rate: mockData.conversionMetrics.cartToOrderRate,
		},
		{
			metric: "Үзсэн → Сагс",
			rate: mockData.conversionMetrics.productViewToCartRate,
		},
		{
			metric: "Төлбөр → Дууссан",
			rate: mockData.conversionMetrics.checkoutCompletionRate,
		},
	];

	return (
		<div className="space-y-6">
			{/* Visitor Overview Cards */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Өдрийн зочин</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.dailyVisits.toLocaleString()}
								</p>
								<div className="mt-1 flex items-center gap-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+8.7%</span>
								</div>
							</div>
							<Eye className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">
									7 хоногийн зочин
								</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.weeklyVisits.toLocaleString()}
								</p>
								<div className="mt-1 flex items-center gap-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+12.3%</span>
								</div>
							</div>
							<Eye className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Сарын зочин</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.monthlyVisits.toLocaleString()}
								</p>
								<div className="mt-1 flex items-center gap-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+5.4%</span>
								</div>
							</div>
							<Eye className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Хөрвүүлэлт</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.conversionMetrics.visitorToOrderRate}%
								</p>
								<div className="mt-1 flex items-center gap-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+0.8%</span>
								</div>
							</div>
							<Target className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Visitor vs Orders Chart */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<Eye className="h-5 w-5" />
						Зочин болон захиалгын харьцуулалт
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={visitorData}
								margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
							>
								<Tooltip
									content={({ active, payload, label }) => {
										if (!active || !payload?.length) return null;

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="mb-2 font-medium text-sm">{label}</p>
												<p className="text-sm">
													<span className="text-muted-foreground">Зочин: </span>
													<span className="font-semibold">
														{payload[0].value?.toLocaleString()}
													</span>
												</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Захиалга:{" "}
													</span>
													<span className="font-semibold">
														{payload[1].value?.toLocaleString()}
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Bar
									dataKey="visitors"
									fill="hsl(var(--chart-1))"
									radius={[8, 8, 0, 0]}
								/>
								<Bar
									dataKey="orders"
									fill="hsl(var(--chart-2))"
									radius={[8, 8, 0, 0]}
								/>
								<XAxis
									dataKey="period"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Conversion Metrics */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<MousePointer className="h-5 w-5" />
						Хөрвүүлэлтийн үзүүлэлтүүд
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{conversionData.map((item) => (
							<div
								key={item.metric}
								className="border-2 border-border bg-card p-4"
							>
								<div className="flex items-center justify-between">
									<div>
										<h4 className="mb-1 font-bold font-heading text-base">
											{item.metric}
										</h4>
										<p className="text-muted-foreground text-sm">
											Хөрвүүлэлтийн хувь
										</p>
									</div>
									<div className="text-right">
										<p className="font-bold font-heading text-2xl">
											{item.rate}%
										</p>
										<div className="mt-1 flex items-center gap-1">
											<TrendingUp className="h-3 w-3 text-green-600" />
											<span className="text-green-600 text-xs">
												+{(Math.random() * 2) | 0}.{(Math.random() * 9) | 0}%
											</span>
										</div>
									</div>
								</div>
								<div className="mt-3">
									<div className="h-2 w-full rounded-full bg-muted">
										<div
											className="h-2 rounded-full bg-chart-1"
											style={{ width: `${Math.min(item.rate * 10, 100)}%` }}
										/>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
