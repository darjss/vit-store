import { useSuspenseQuery } from "@tanstack/react-query";
import type { timeRangeType } from "@vit/shared";
import {
	Activity,
	BarChart3,
	DollarSign,
	Eye,
	Package,
	ShoppingCart,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { StatCard } from "./stat-card";

export function StatsGrid({
	defaultTimeRange = "daily",
}: {
	defaultTimeRange?: timeRangeType;
}) {
	const { data: stats } = useSuspenseQuery(trpc.sales.analytics.queryOptions());
	const [timeRange, setTimeRange] = useState<timeRangeType>(defaultTimeRange);
	const todayStats = [
		{
			title: "Өдрийн орлого",
			value: formatCurrency(stats.daily.revenue),
			change: 12.5,
			changeType: "increase" as const,
			icon: DollarSign,
			period: "өчигдөрөөс",
		},
		{
			title: "Өдрийн захиалга",
			value: formatCurrency(stats.daily.salesCount),
			change: 15.3,
			changeType: "increase" as const,
			icon: ShoppingCart,
			period: "өчигдөрөөс",
		},
		{
			title: "Өдрийн зочин",
			value: formatCurrency(stats.daily.profit),
			change: 8.7,
			changeType: "increase" as const,
			icon: Eye,
			period: "өчигдөрөөс",
		},
	];

	const weekStats = [
		{
			title: "7 хоногийн орлого",
			value: formatCurrency(stats.weekly.revenue),
			change: 8.2,
			changeType: "increase" as const,
			icon: BarChart3,
			period: "өмнөх 7 хоноос",
		},
		{
			title: "7 хоногийн захиалга",
			value: formatCurrency(stats.weekly.salesCount),
			change: 6.7,
			changeType: "increase" as const,
			icon: Package,
			period: "өмнөх 7 хоноос",
		},
		{
			title: "7 хоногийн зочин",
			value: formatCurrency(stats.weekly.profit),
			change: 12.3,
			changeType: "increase" as const,
			icon: Eye,
			period: "өмнөх 7 хоноос",
		},
	];

	const monthStats = [
		{
			title: "Сарын орлого",
			value: formatCurrency(stats.monthly.revenue),
			change: -3.1,
			changeType: "decrease" as const,
			icon: TrendingUp,
			period: "өмнөх сараас",
		},
		{
			title: "Сарын захиалга",
			value: formatCurrency(stats.monthly.salesCount),
			change: 2.1,
			changeType: "increase" as const,
			icon: Activity,
			period: "өмнөх сараас",
		},
		{
			title: "Сарын зочин",
			value: formatCurrency(stats.monthly.profit),
			change: 5.4,
			changeType: "increase" as const,
			icon: Eye,
			period: "өмнөх сараас",
		},
	];

	return (
		<Card className="w-full border-2 border-border shadow-shadow">
			<CardContent className="p-4">
				<Tabs
					defaultValue={timeRange}
					className="space-y-4"
					onValueChange={(value) => setTimeRange(value as timeRangeType)}
				>
					<TabsList className="grid w-full grid-cols-3 border-2 border-border bg-card">
						<TabsTrigger value="daily" className="font-bold">
							Өнөөдөр
						</TabsTrigger>
						<TabsTrigger value="weekly" className="font-bold">
							7 хоног
						</TabsTrigger>
						<TabsTrigger value="monthly" className="font-bold">
							Сар
						</TabsTrigger>
					</TabsList>

					<TabsContent value="daily" className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{todayStats.map((stat, index) => (
								<StatCard
									key={index}
									title={stat.title}
									value={stat.value}
									change={stat.change}
									changeType={stat.changeType}
									icon={stat.icon}
									period={stat.period}
								/>
							))}
						</div>
					</TabsContent>

					<TabsContent value="weekly" className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{weekStats.map((stat, index) => (
								<StatCard
									key={index}
									title={stat.title}
									value={stat.value}
									change={stat.change}
									changeType={stat.changeType}
									icon={stat.icon}
									period={stat.period}
								/>
							))}
						</div>
					</TabsContent>

					<TabsContent value="monthly" className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{monthStats.map((stat, index) => (
								<StatCard
									key={index}
									title={stat.title}
									value={stat.value}
									change={stat.change}
									changeType={stat.changeType}
									icon={stat.icon}
									period={stat.period}
								/>
							))}
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
