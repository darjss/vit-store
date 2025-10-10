import { BarChart3 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { getRevenueData } from "@/lib/utils";
import type { timeRangeType } from "@server/lib/zod/schema";

interface SalesChartProps {
	selectedPeriod: timeRangeType;
}

export function SalesChart({ selectedPeriod }: SalesChartProps) {
	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<BarChart3 className="h-5 w-5" />
					Орлогын чиг хандлага
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				<ChartContainer
					config={{
						revenue: {
							label: "Орлого",
							color: "hsl(var(--chart-1))",
						},
					}}
					className="h-[300px]"
				>
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={getRevenueData(selectedPeriod)}>
							<XAxis dataKey="date" />
							<YAxis />
							<ChartTooltip content={<ChartTooltipContent />} />
							<Line
								type="monotone"
								dataKey="revenue"
								stroke="hsl(var(--chart-1))"
								strokeWidth={3}
							/>
						</LineChart>
					</ResponsiveContainer>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
