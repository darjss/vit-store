import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function InventorySummary() {
	const { timeRange } = useSearch({ from: "/_dash/analytics" });
	const { data } = useSuspenseQuery(
		trpc.analytics.getAnalyticsData.queryOptions({
			timeRange: timeRange as "daily" | "weekly" | "monthly",
		}),
	);

	const lowStockItems = data.lowInventoryProducts.slice(0, 5); // Show top 5

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center justify-between font-heading text-xl">
					<div className="flex items-center gap-3">
						<AlertTriangle className="h-5 w-5 text-orange-600" />
						Бага үлдэгдэлтэй бүтээгдэхүүн
					</div>
					{data.lowInventoryProducts.length > 5 && (
						<Link to="/products">
							<Button variant="ghost" size="sm" className="h-8 text-xs">
								Бүгдийг харах
								<ArrowRight className="ml-1 h-3 w-3" />
							</Button>
						</Link>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				{lowStockItems.length > 0 ? (
					<div className="space-y-3">
						{lowStockItems.map((item) => (
							<div
								key={item.productId}
								className="border-2 border-orange-300 bg-orange-50 shadow-sm transition-shadow hover:shadow-md"
							>
								<div className="p-4">
									<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
										<div className="flex items-center gap-3">
											{item.imageUrl && (
												<img
													src={item.imageUrl}
													alt={item.name}
													className="h-12 w-12 rounded-base border-2 border-border object-cover"
												/>
											)}
											<div>
												<div className="font-bold font-heading text-base">
													{item.name}
												</div>
												<div className="text-muted-foreground text-sm">
													Үнэ: {formatCurrency(item.price)}
												</div>
											</div>
										</div>
										<Badge
											variant="outline"
											className="border-2 border-orange-300 bg-orange-100 font-bold text-orange-600"
										>
											{item.stock} үлдсэн
										</Badge>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="flex h-40 items-center justify-center text-muted-foreground">
						Бага үлдэгдэлтэй бүтээгдэхүүн байхгүй
					</div>
				)}
			</CardContent>
		</Card>
	);
}
