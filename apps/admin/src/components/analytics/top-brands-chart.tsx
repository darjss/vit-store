import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Award } from "lucide-react";
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

export function TopBrandsChart() {
	const { timeRange } = useSearch({ from: "/_dash/analytics" });
	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({
			timeRange: timeRange as "daily" | "weekly" | "monthly",
		}),
	);

	const chartData = data.topBrands
		.map((brand) => ({
			brand: brand.brandName,
			revenue: brand.total,
			quantity: brand.quantity,
		}))
		.slice(0, 5); // Top 5 brands

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<Award className="h-5 w-5" />
					Топ брэндүүд
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				{chartData.length > 0 ? (
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={chartData}
								layout="vertical"
								margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="hsl(var(--muted))"
								/>
								<XAxis
									type="number"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
									tickFormatter={(value) => formatCurrency(value)}
								/>
								<YAxis
									type="category"
									dataKey="brand"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
									width={90}
								/>
								<Tooltip
									content={({ active, payload, label }) => {
										if (!active || !payload?.length) return null;

										const data = payload[0].payload as {
											brand: string;
											revenue: number;
											quantity: number;
										};

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="mb-2 font-medium text-sm">{label}</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Орлого:{" "}
													</span>
													<span className="font-semibold">
														{formatCurrency(data.revenue)}
													</span>
												</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Тоо ширхэг:{" "}
													</span>
													<span className="font-semibold">
														{data.quantity}
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Bar
									dataKey="revenue"
									fill="hsl(var(--chart-2))"
									radius={[0, 8, 8, 0]}
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

