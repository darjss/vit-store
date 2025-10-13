import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export function LowStockAlerts() {
	const { data: lowStockItems } = useSuspenseQuery({
		...trpc.analytics.getLowInventoryProducts.queryOptions(),
	});

	return (
		<>
			{lowStockItems.length !== 0 && (
				<Card className="border-2 border-border shadow-shadow">
					<CardHeader className="border-border border-b-2 bg-secondary-background">
						<CardTitle className="flex items-center gap-3 font-heading text-orange-600 text-xl">
							<AlertTriangle className="h-5 w-5" />
							Бага үлдэгдэлтэй бүтээгдэхүүнүүд
						</CardTitle>
					</CardHeader>
					<CardContent className="max-h-96 space-y-3 overflow-y-auto p-4">
						{lowStockItems.map((item) => (
							<div
								key={item.name}
								className="border-2 border-orange-300 bg-orange-50 shadow-sm transition-shadow hover:shadow-md"
							>
								<div className="p-4">
									<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
										<div>
											<div className="font-bold font-heading text-base">
												{item.name}
											</div>
											<div className="text-muted-foreground text-sm">
												Үлдэгдэл: {item.stock}
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
					</CardContent>
				</Card>
			)}
		</>
	);
}
