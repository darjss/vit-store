import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function CategorySalesChart() {
	const { timeRange = "monthly" } = useSearch({ from: "/_dash/analytics" });
	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({
			timeRange: timeRange as "daily" | "weekly" | "monthly",
		}),
	);

	const categoryMap = new Map<string, number>();
	for (const sale of data.salesByCategory) {
		const current = categoryMap.get(sale.categoryName) || 0;
		categoryMap.set(sale.categoryName, current + sale.total);
	}

	const chartData = Array.from(categoryMap.entries())
		.map(([categoryName, total]) => ({
			category: categoryName,
			total: total,
		}))
		.sort((a, b) => b.total - a.total)
		.slice(0, 10);

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<BarChart3 className="h-5 w-5" />
					Ангилалаар борлуулалт
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				{chartData.length > 0 ? (
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={chartData}
								margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="hsl(var(--muted))"
								/>
								<XAxis
									dataKey="category"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
									angle={-45}
									textAnchor="end"
									height={80}
								/>
								<YAxis
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
									tickFormatter={(value) => formatCurrency(value)}
								/>
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
											</div>
										);
									}}
								/>
								<Bar
									dataKey="total"
									fill="hsl(var(--chart-1))"
									radius={[8, 8, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : (
					<div className="flex h-[300px] items-center justify-center text-muted-foreground">
						Өгөгдөл байхгүй
					</div>
				)}
			</CardContent>
		</Card>
	);
}
