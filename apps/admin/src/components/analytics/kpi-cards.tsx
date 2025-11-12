import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import {
	DollarSign,
	Package,
	Repeat,
	AlertTriangle,
	TrendingUp,
	Warehouse,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { StatCard } from "../dashboard/stat-card";

export function KpiCards() {
	const { timeRange } = useSearch({ from: "/_dash/analytics" });
	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({
			timeRange: timeRange as "daily" | "weekly" | "monthly",
		}),
	);

	const kpis = [
		{
			title: "Дундаж захиалгын үнэ",
			value: formatCurrency(data.averageOrderValue),
			icon: DollarSign,
		},
		{
			title: "Нийт ашиг",
			value: formatCurrency(data.totalProfit),
			icon: TrendingUp,
		},
		{
			title: "Давтан захиалга өгсөн харилцагч",
			value: data.repeatCustomers.toString(),
			icon: Repeat,
		},
		{
			title: "Бага үлдэгдэлтэй бүтээгдэхүүн",
			value: data.metrics.lowStockCount.toString(),
			icon: AlertTriangle,
		},
		{
			title: "Топ брэндүүдийн орлого",
			value: formatCurrency(data.metrics.topBrandRevenue),
			icon: Package,
		},
		{
			title: "Одоогийн бүтээгдэхүүний үнэлгээ",
			value: formatCurrency(data.metrics.currentProductsValue),
			icon: Warehouse,
		},
	];

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{kpis.map((kpi, index) => (
				<StatCard
					key={index}
					title={kpi.title}
					value={kpi.value}
					icon={kpi.icon}
				/>
			))}
		</div>
	);
}

