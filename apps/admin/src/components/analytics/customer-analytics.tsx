import { Users, TrendingUp, TrendingDown, UserCheck } from "lucide-react";
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

export function CustomerAnalytics() {
	const retentionData = [
		{
			name: "Буцах харилцагчид",
			value: mockData.customerRetention.returningCustomers,
			color: "hsl(var(--chart-1))",
		},
		{
			name: "Шинэ харилцагчид",
			value: mockData.customerRetention.newCustomers,
			color: "hsl(var(--chart-2))",
		},
	];

	return (
		<div className="space-y-6">
			{/* Customer Retention Overview */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">
									Нийт харилцагчид
								</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.totalCustomers.toLocaleString()}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+8.5%</span>
								</div>
							</div>
							<Users className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">
									Дахин хандлагчид
								</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.customerRetention.returningCustomers}
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+12.3%</span>
								</div>
							</div>
							<UserCheck className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Хадгалах хувь</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.customerRetention.retentionRate}%
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-600" />
									<span className="text-green-600 text-xs">+2.1%</span>
								</div>
							</div>
							<UserCheck className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>

				<Card className="border-2 border-border shadow-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-muted-foreground text-sm">Гарах хувь</p>
								<p className="font-bold font-heading text-2xl">
									{mockData.customerRetention.churnRate}%
								</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingDown className="h-3 w-3 text-red-600" />
									<span className="text-red-600 text-xs">-1.8%</span>
								</div>
							</div>
							<TrendingDown className="h-8 w-8 text-muted-foreground" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Customer Lifetime Value */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<Users className="h-5 w-5" />
						Харилцагчийн үнэ цэн (CLV)
					</CardTitle>
				</CardHeader>
				<CardContent className="max-h-96 space-y-3 overflow-y-auto p-4">
					{mockData.customerLifetimeValue.map((customer, index) => (
						<div
							key={customer.name}
							className="border-2 border-border bg-card shadow-sm transition-shadow hover:shadow-md"
						>
							<div className="p-4">
								<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded border-2 border-border bg-primary font-bold font-heading text-lg">
											{index + 1}
										</div>
										<div>
											<div className="font-bold font-heading text-base">
												{customer.name}
											</div>
											<div className="text-muted-foreground text-sm">
												{customer.orderCount} захиалга
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="font-bold font-heading text-lg">
											{formatCurrency(customer.totalSpent)}
										</div>
										<div className="text-muted-foreground text-sm">
											Дундаж: {formatCurrency(customer.avgOrderValue)}
										</div>
									</div>
								</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Customer Retention Chart */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<UserCheck className="h-5 w-5" />
						Харилцагчийн хадгалах аналитик
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={retentionData}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ name, percent }) =>
										`${name}: ${((percent as number) * 100).toFixed(0)}%`
									}
									outerRadius={80}
									fill="#8884d8"
									dataKey="value"
								>
									{retentionData.map((entry, index) => (
										<Cell key={`cell-${index}`} fill={entry.color} />
									))}
								</Pie>
								<Tooltip
									content={({ active, payload }) => {
										if (!active || !payload?.length) return null;

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="font-medium text-sm">{payload[0].name}</p>
												<p className="text-sm">
													<span className="font-semibold">
														{payload[0].value} харилцагч
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
		</div>
	);
}
