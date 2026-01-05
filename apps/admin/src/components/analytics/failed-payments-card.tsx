import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { AlertCircle, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function FailedPaymentsCard() {
	const { timeRange } = useSearch({ from: "/_dash/analytics" });
	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({
			timeRange: timeRange as "daily" | "weekly" | "monthly",
		}),
	);

	const { count, total } = data.failedPayments;

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<AlertCircle className="h-5 w-5 text-red-600" />
					Амжилтгүй төлбөр
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				{count > 0 ? (
					<div className="space-y-4">
						<div className="flex items-center justify-between rounded-base border-2 border-red-200 bg-red-50 p-4">
							<div className="flex items-center gap-3">
								<div className="rounded-full bg-red-100 p-2">
									<TrendingDown className="h-5 w-5 text-red-600" />
								</div>
								<div>
									<p className="font-bold font-heading text-2xl text-red-600">
										{count}
									</p>
									<p className="text-muted-foreground text-sm">
										Амжилтгүй төлбөр
									</p>
								</div>
							</div>
						</div>
						<div className="rounded-base border-2 border-border bg-card p-4">
							<p className="text-muted-foreground text-sm">Нийт дүн:</p>
							<p className="font-bold font-heading text-xl">
								{formatCurrency(total)}
							</p>
						</div>
					</div>
				) : (
					<div className="flex h-40 items-center justify-center text-muted-foreground">
						Амжилтгүй төлбөр байхгүй
					</div>
				)}
			</CardContent>
		</Card>
	);
}
