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
import { getRevenueData } from "@/lib/utils";

export function SalesChart() {
	const { timeRange } = useSearch({ from: "/_dash/" });
	const data = getRevenueData(timeRange);

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<BarChart3 className="h-5 w-5" />
					Орлогын чиг хандлага
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				<div className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={data}
							margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
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
							<Tooltip
								content={({ active, payload, label }) => {
									if (!active || !payload?.length) return null;

									return (
										<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
											<p className="mb-2 font-medium text-sm">{label}</p>
											<p className="text-sm">
												<span className="text-muted-foreground">Орлого: </span>
												<span className="font-semibold">
													{new Intl.NumberFormat("mn-MN", {
														style: "currency",
														currency: "MNT",
													}).format(payload[0].value as number)}
												</span>
											</p>
										</div>
									);
								}}
							/>
							<Bar
								dataKey="revenue"
								fill="hsl(var(--chart-1))"
								radius={[8, 8, 0, 0]}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
