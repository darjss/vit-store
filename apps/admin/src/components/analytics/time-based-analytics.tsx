import { Calendar, Clock, TrendingUp } from "lucide-react";
import {
	Bar,
	BarChart,
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

export function TimeBasedAnalytics() {
	return (
		<div className="space-y-6">
			{/* Peak Sales Hours */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<Clock className="h-5 w-5" />
						Цагийн хуваарьт борлуулалт
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={mockData.peakSalesHours}
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
														Захиалга:{" "}
													</span>
													<span className="font-semibold">
														{payload[0].value} ширхэг
													</span>
												</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Орлого:{" "}
													</span>
													<span className="font-semibold">
														{formatCurrency(payload[1].value as number)}
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Bar
									dataKey="sales"
									fill="hsl(var(--chart-1))"
									radius={[8, 8, 0, 0]}
								/>
								<XAxis
									dataKey="hour"
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

			{/* Seasonal Sales Patterns */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<Calendar className="h-5 w-5" />
						Сарын хугацааны борлуулалтын хандлага
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart
								data={mockData.seasonalPatterns}
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
													<span className="text-muted-foreground">
														Захиалга:{" "}
													</span>
													<span className="font-semibold">
														{payload[1].value} ширхэг
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
								<XAxis
									dataKey="month"
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

			{/* Peak Hours Summary */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<TrendingUp className="h-5 w-5" />
						Шилдэг цагийн хуваарь
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div className="border-2 border-border bg-card p-4">
							<h4 className="mb-2 font-bold font-heading">Өглөөний цаг</h4>
							<p className="font-bold text-2xl text-chart-1">09:00 - 12:00</p>
							<p className="mt-1 text-muted-foreground text-sm">
								75 захиалга • ₮5.9M орлого
							</p>
						</div>
						<div className="border-2 border-border bg-card p-4">
							<h4 className="mb-2 font-bold font-heading">Үдийн дараах</h4>
							<p className="font-bold text-2xl text-chart-2">14:00 - 17:00</p>
							<p className="mt-1 text-muted-foreground text-sm">
								87 захиалга • ₮6.8M орлого
							</p>
						</div>
						<div className="border-2 border-border bg-card p-4">
							<h4 className="mb-2 font-bold font-heading">Оройн цаг</h4>
							<p className="font-bold text-2xl text-chart-3">19:00 - 20:00</p>
							<p className="mt-1 text-muted-foreground text-sm">
								73 захиалга • ₮5.1M орлого
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
