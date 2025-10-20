import { TrendingUp, DollarSign, Percent } from "lucide-react";
import {
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export function RevenueAnalytics() {
	const revenueData = mockData.revenueData.map((item) => ({
		...item,
		profit: Math.floor(item.revenue * (mockData.profitMargin.daily / 100)),
	}));

	return (
		<div className="space-y-6">
			{/* Revenue Overview Cards */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Өдрийн орлого</p>
								<p className="font-bold font-heading text-2xl">
									{formatCurrency(mockData.dailyRevenue)}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+12.5%</span>
								</div>
							</div>
							<DollarSign className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Ашигийн маржин</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.profitMargin.daily}%
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+2.3%</span>
								</div>
							</div>
							<Percent className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">
									Дундаж захиалгын үнэ
								</p>
								<p className="font-bold font-heading text-2xl">
									{formatCurrency(mockData.averageOrderValue.daily)}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+5.2%</span>
								</div>
							</div>
							<DollarSign className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">
									7 хоногийн орлого
								</p>
								<p className="font-bold font-heading text-2xl">
									{formatCurrency(mockData.weeklyRevenue)}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+8.2%</span>
								</div>
							</div>
							<DollarSign className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Revenue Trend Chart */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<DollarSign className="h-5 w-5" />
						Орлогын чиг хандлага
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={revenueData}
								margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
							>
								<Tooltip
									content={({ active, payload, label }) => {
										if (!active || !payload?.length) return null;

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="mb-2 font-medium text-sm">{label}</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Орлого:{" "}
													</span>
													<span className="font-semibold">
														{formatCurrency(payload[0].value as number)}
													</span>
												</p>
												<p className="text-sm">
													<span className="text-muted-foreground">Ашиг: </span>
													<span className="font-semibold text-green-600">
														{formatCurrency(payload[1].value as number)}
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Line
									type="monotone"
									dataKey="revenue"
									stroke="hsl(var(--chart-1))"
									strokeWidth={2}
									dot={{ fill: "hsl(var(--chart-1))" }}
								/>
								<Line
									type="monotone"
									dataKey="profit"
									stroke="hsl(var(--chart-2))"
									strokeWidth={2}
									dot={{ fill: "hsl(var(--chart-2))" }}
								/>
								<XAxis
									dataKey="date"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
