import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export function TopSellingProducts() {
	const { timeRange } = useSearch({ from: "/_dash/" });
	const { data: products } = useSuspenseQuery({
		...trpc.sales.topProducts.queryOptions({ timeRange, productCount: 10 }),
	});

	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<TrendingUp className="h-5 w-5" />
					Хамгийн их зарагдсан бүтээгдэхүүнүүд
				</CardTitle>
			</CardHeader>
			<CardContent className="max-h-96 space-y-3 overflow-y-auto p-4">
				{products.length === 0 && <div>No products</div>}
				{products.map((product, index) => (
					<div
						key={product.name}
						className="border-2 border-border bg-card shadow-sm transition-shadow hover:shadow-md"
					>
						<div className="p-4">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded border-2 border-border bg-primary font-bold font-heading text-lg">
										{index + 1}
									</div>
									<div>
										<div className="font-bold font-heading text-base">
											{product.name}
										</div>
										<div className="text-muted-foreground text-sm">
											{product.totalSold} ширхэг зарагдсан
										</div>
									</div>
								</div>
								<div className="text-right">
									<div className="font-bold font-heading text-lg">
										₮{product.revenue.toLocaleString()}
									</div>
								</div>
							</div>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
