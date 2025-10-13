import type { timeRangeType } from "@server/lib/zod/schema";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import {
	Activity,
	BarChart3,
	DollarSign,
	Eye,
	Package,
	ShoppingCart,
	TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/utils/trpc";
import { StatCard } from "./stat-card";

const mockData = {
	dailyRevenue: 2450000,
	weeklyRevenue: 17200000,
	monthlyRevenue: 68500000,
	dailyOrders: 45,
	weeklyOrders: 312,
	monthlyOrders: 1248,
	dailyVisits: 1247,
	weeklyVisits: 8234,
	monthlyVisits: 32847,
};

export function StatsGrid() {
	// const { data } = useSuspenseQueries([
	// 	{
	// 		...trpc.sales.analytics.queryOptions({ timeRange: "daily" }),
	// 	},
	// 	{},
	// ]);
	const todayStats = [
		{
			title: "Өдрийн орлого",
			value: `₮${mockData.dailyRevenue.toLocaleString()}`,
			change: 12.5,
			changeType: "increase" as const,
			icon: DollarSign,
			period: "өчигдөрөөс",
		},
		{
			title: "Өдрийн захиалга",
			value: mockData.dailyOrders,
			change: 15.3,
			changeType: "increase" as const,
			icon: ShoppingCart,
			period: "өчигдөрөөс",
		},
		{
			title: "Өдрийн зочин",
			value: mockData.dailyVisits.toLocaleString(),
			change: 8.7,
			changeType: "increase" as const,
			icon: Eye,
			period: "өчигдөрөөс",
		},
	];

	const weekStats = [
		{
			title: "7 хоногийн орлого",
			value: `₮${mockData.weeklyRevenue.toLocaleString()}`,
			change: 8.2,
			changeType: "increase" as const,
			icon: BarChart3,
			period: "өмнөх 7 хоноос",
		},
		{
			title: "7 хоногийн захиалга",
			value: mockData.weeklyOrders,
			change: 6.7,
			changeType: "increase" as const,
			icon: Package,
			period: "өмнөх 7 хоноос",
		},
		{
			title: "7 хоногийн зочин",
			value: mockData.weeklyVisits.toLocaleString(),
			change: 12.3,
			changeType: "increase" as const,
			icon: Eye,
			period: "өмнөх 7 хоноос",
		},
	];

	const monthStats = [
		{
			title: "Сарын орлого",
			value: `₮${mockData.monthlyRevenue.toLocaleString()}`,
			change: -3.1,
			changeType: "decrease" as const,
			icon: TrendingUp,
			period: "өмнөх сараас",
		},
		{
			title: "Сарын захиалга",
			value: mockData.monthlyOrders,
			change: 2.1,
			changeType: "increase" as const,
			icon: Activity,
			period: "өмнөх сараас",
		},
		{
			title: "Сарын зочин",
			value: mockData.monthlyVisits.toLocaleString(),
			change: 5.4,
			changeType: "increase" as const,
			icon: Eye,
			period: "өмнөх сараас",
		},
	];

	return (
		<Card className="w-full border-2 border-border shadow-shadow">
			<CardContent className="p-4">
				<Tabs defaultValue="today" className="space-y-4">
					<TabsList className="grid w-full grid-cols-3 border-2 border-border bg-card">
						<TabsTrigger value="today" className="font-bold">
							Өнөөдөр
						</TabsTrigger>
						<TabsTrigger value="week" className="font-bold">
							7 хоног
						</TabsTrigger>
						<TabsTrigger value="month" className="font-bold">
							Сар
						</TabsTrigger>
					</TabsList>

					<TabsContent value="today" className="space-y-4">
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

					<TabsContent value="week" className="space-y-4">
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

					<TabsContent value="month" className="space-y-4">
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
