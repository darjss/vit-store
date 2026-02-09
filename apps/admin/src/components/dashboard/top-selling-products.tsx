import { useSuspenseQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export function TopSellingProducts({
	timeRange = "daily",
}: {
	timeRange?: "daily" | "weekly" | "monthly";
}) {
	const { data: products } = useSuspenseQuery({
		...trpc.sales.topProducts.queryOptions({ timeRange, productCount: 10 }),
	});

	return (
		<Suspense fallback={<div>Loading...</div>}>
			<Card className="h-full border-2 border-border shadow-hard">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 border-border border-b-2 bg-background p-4 pb-2">
					<CardTitle className="font-black font-heading text-xl uppercase tracking-tight">
						Топ Бүтээгдэхүүн
					</CardTitle>
					<TrendingUp className="h-5 w-5 opacity-50" />
				</CardHeader>
				<CardContent className="p-0">
					<div className="max-h-[400px] divide-y-2 divide-border overflow-y-auto">
						{products.length === 0 && (
							<div className="p-8 text-center text-muted-foreground text-sm">
								Борлуулалт алга байна.
							</div>
						)}
						{products.map((product, index) => (
							<div
								key={product.name}
								className="group flex items-center justify-between p-4 transition-colors hover:bg-muted/10"
							>
								<div className="flex items-center gap-3">
									<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-background font-bold font-heading shadow-hard-sm group-hover:bg-primary group-hover:text-primary-foreground">
										{index + 1}
									</div>
									<div>
										<div className="font-bold font-heading text-sm leading-tight">
											{product.name}
										</div>
										<div className="text-muted-foreground text-xs">
											{product.totalSold} ширхэг
										</div>
									</div>
								</div>
								<div className="text-right">
									<Badge variant="outline" className="border-2 font-bold">
										₮{product.revenue.toLocaleString()}
									</Badge>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</Suspense>
	);
}
