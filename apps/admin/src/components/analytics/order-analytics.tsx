import {
	ShoppingCart,
	TrendingDown,
	AlertTriangle,
	CheckCircle,
} from "lucide-react";
import {
	PieChart,
	Pie,
	Cell,
	ResponsiveContainer,
	Tooltip,
	Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export function OrderAnalytics() {
	const statusColors = {
		pending: "hsl(var(--chart-1))",
		shipped: "hsl(var(--chart-2))",
		delivered: "hsl(var(--chart-3))",
		cancelled: "hsl(var(--destructive))",
		refunded: "hsl(var(--muted-foreground))",
	};

	const orderStatusData = mockData.orderStatusBreakdown.map((item) => ({
		...item,
		color: statusColors[item.status as keyof typeof statusColors],
	}));

	return (
		<div className="space-y-6">
			{/* Order Status Overview */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Хүлээгдэж буй</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.orderStatusBreakdown.find(
										(s) => s.status === "pending",
									)?.count || 0}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<span className="text-yellow-600 text-xs">
										{
											mockData.orderStatusBreakdown.find(
												(s) => s.status === "pending",
											)?.percentage
										}
										%
									</span>
								</div>
							</div>
							<ShoppingCart className="h-8 w-8 text-yellow-600" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Хүргэгдсэн</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.orderStatusBreakdown.find(
										(s) => s.status === "delivered",
									)?.count || 0}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<span className="text-green-600 text-xs">
										{
											mockData.orderStatusBreakdown.find(
												(s) => s.status === "delivered",
											)?.percentage
										}
										%
									</span>
								</div>
							</div>
							<CheckCircle className="h-8 w-8 text-green-600" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Цуцлагдсан</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.orderStatusBreakdown.find(
										(s) => s.status === "cancelled",
									)?.count || 0}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<span className="text-red-600 text-xs">
										{
											mockData.orderStatusBreakdown.find(
												(s) => s.status === "cancelled",
											)?.percentage
										}
										%
									</span>
								</div>
							</div>
							<TrendingDown className="h-8 w-8 text-red-600" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Нийт захиалга</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.orderStatusBreakdown.reduce(
										(sum, item) => sum + item.count,
										0,
									)}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<span className="text-blue-600 text-xs">Өнөөдөр</span>
								</div>
							</div>
							<ShoppingCart className="h-8 w-8 text-blue-600" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Order Status Breakdown */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<ShoppingCart className="h-5 w-5" />
						Захиалгын төлөв байдал
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={orderStatusData}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ name, percent }) =>
										`${name}: ${((percent as number) * 100).toFixed(0)}%`
									}
									outerRadius={80}
									fill="#8884d8"
									dataKey="count"
								>
									{orderStatusData.map((entry, index) => (
										<Cell key={`cell-${index}`} fill={entry.color} />
									))}
								</Pie>
								<Tooltip
									content={({ active, payload }) => {
										if (!active || !payload?.length) return null;

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="font-medium text-sm capitalize">
													{payload[0].payload.status}
												</p>
												<p className="text-sm">
													<span className="font-semibold">
														{payload[0].value} захиалга
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Legend />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>

			{/* Abandoned Cart Analytics */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<AlertTriangle className="h-5 w-5" />
						Сагсан дахь барааны аналитик
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div className="border-2 border-border bg-card p-4">
							<h4 className="text-muted-foreground text-sm mb-1">
								Нийт орхигдсон сагс
							</h4>
							<p className="font-bold font-heading text-2xl">
								{mockData.abandonedCartAnalytics.totalAbandoned}
							</p>
						</div>
						<div className="border-2 border-border bg-card p-4">
							<h4 className="text-muted-foreground text-sm mb-1">Орхих хувь</h4>
							<p className="font-bold font-heading text-2xl">
								{mockData.abandonedCartAnalytics.abandonmentRate}%
							</p>
						</div>
						<div className="border-2 border-border bg-card p-4">
							<h4 className="text-muted-foreground text-sm mb-1">
								Алдсан орлого
							</h4>
							<p className="font-bold font-heading text-lg">
								{formatCurrency(mockData.abandonedCartAnalytics.lostRevenue)}
							</p>
						</div>
						<div className="border-2 border-border bg-card p-4">
							<h4 className="text-muted-foreground text-sm mb-1">
								Сэргээсэн орлого
							</h4>
							<p className="font-bold font-heading text-lg text-green-600">
								{formatCurrency(
									mockData.abandonedCartAnalytics.recoveredRevenue,
								)}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
