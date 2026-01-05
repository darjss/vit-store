import { useNavigate, useSearch } from "@tanstack/react-router";
import type { timeRangeType } from "@vit/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TimeRangeTabs() {
	const { timeRange = "monthly" } = useSearch({ from: "/_dash/analytics" });
	const navigate = useNavigate({ from: "/analytics" });

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardContent className="p-4">
				<Tabs
					value={timeRange}
					onValueChange={(value) => {
						navigate({
							to: "/analytics",
							search: (prev) => ({
								...prev,
								timeRange: value as timeRangeType,
							}),
						});
					}}
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
				</Tabs>
			</CardContent>
		</Card>
	);
}
