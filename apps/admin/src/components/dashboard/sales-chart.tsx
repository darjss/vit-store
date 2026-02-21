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
import { getRevenueData } from "@/lib/utils";

export function SalesChart({
	timeRange = "daily",
}: {
	timeRange?: "daily" | "weekly" | "monthly";
}) {
	const data = getRevenueData(timeRange);

	return (
		<Card className="border-2 border-border shadow-hard">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 border-border border-b-2 bg-background p-4 pb-2">
				<CardTitle className="font-black font-heading text-xl uppercase tracking-tight">
					Орлого
				</CardTitle>
				<div className="rounded-none border-2 border-border bg-primary px-2 py-1 font-bold text-xs">
					{timeRange === "daily"
						? "Өнөөдөр"
						: timeRange === "weekly"
							? "7 хоног"
							: "Сар"}
				</div>
			</CardHeader>
			<CardContent className="p-4 pt-6">
				<div className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={data}
							margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
						>
							<CartesianGrid
								strokeDasharray="4 4"
								vertical={false}
								stroke="var(--color-border)"
								opacity={0.3}
							/>
							<XAxis
								dataKey="date"
								tick={{ fontSize: 11, fontWeight: 600 }}
								tickLine={false}
								axisLine={false}
								dy={10}
							/>
							<YAxis
								tick={{ fontSize: 11, fontWeight: 600 }}
								tickLine={false}
								axisLine={false}
								tickFormatter={(value) => `${value / 1000}k`}
							/>
							<Tooltip
								cursor={{
									fill: "var(--color-muted)",
									opacity: 0.2,
								}}
								content={({ active, payload, label }) => {
									if (!active || !payload?.length) return null;
									return (
										<div className="brutal-card bg-background p-2 text-xs shadow-hard-sm">
											<p className="mb-1 font-bold">{label}</p>
											<p className="font-bold font-mono text-primary-foreground">
												<span className="bg-primary px-1">
													₮
													{new Intl.NumberFormat("mn-MN").format(
														payload[0].value as number,
													)}
												</span>
											</p>
										</div>
									);
								}}
							/>
							<Bar
								dataKey="revenue"
								fill="var(--color-primary)"
								stroke="var(--color-border)"
								strokeWidth={2}
								radius={0}
								activeBar={{
									fill: "var(--color-accent)",
									stroke: "var(--color-border)",
									strokeWidth: 2,
								}}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
