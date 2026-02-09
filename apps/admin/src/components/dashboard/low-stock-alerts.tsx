import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export function LowStockAlerts() {
	const { data: lowStockItems } = useSuspenseQuery({
		...trpc.analytics.getLowInventoryProducts.queryOptions(),
	});

	if (lowStockItems.length === 0) return null;

	return (
		<Card className="border-2 border-destructive bg-destructive/5 shadow-hard">
			<CardHeader className="flex flex-row items-center gap-2 border-destructive border-b-2 p-4 pb-2">
				<div className="border-2 border-destructive bg-destructive p-1 text-destructive-foreground">
					<AlertTriangle className="h-4 w-4" />
				</div>
				<CardTitle className="font-black font-heading text-destructive text-xl uppercase tracking-tight">
					Анхааруулга
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<div className="divide-y-2 divide-destructive/20">
					{lowStockItems.map((item) => (
						<div
							key={item.name}
							className="flex items-center justify-between p-3 transition-colors hover:bg-destructive/10"
						>
							<span className="font-bold text-sm">{item.name}</span>
							<Badge
								variant="destructive"
								className="border-2 border-destructive font-bold shadow-none"
							>
								{item.stock} үлдсэн
							</Badge>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
