import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";

export function TopSellingProducts() {
	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<TrendingUp className="h-5 w-5" />
					Хамгийн их зарагдсан бүтээгдэхүүнүүд
				</CardTitle>
			</CardHeader>
			<CardContent className="max-h-96 space-y-3 overflow-y-auto p-4">
				{mockData.topProducts.map((product, index) => (
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
											{product.sold} ширхэг зарагдсан
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
