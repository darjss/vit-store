import { BarChart3, Eye, ShoppingCart, TrendingUp } from "lucide-react";
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export function ProductPerformance() {
	return (
		<div className="space-y-6">
			{/* Top Products by Revenue */}
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
											{formatCurrency(product.revenue)}
										</div>
									</div>
								</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Product Performance Metrics */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<BarChart3 className="h-5 w-5" />
						Бүтээгдэхүүний гүйцэтгэл
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="space-y-4">
						{mockData.productPerformance.map((product) => (
							<div
								key={product.name}
								className="border-2 border-border bg-card p-4"
							>
								<div className="mb-3 flex items-center justify-between">
									<h4 className="font-bold font-heading">{product.name}</h4>
									<div className="flex items-center gap-4 text-sm">
										<div className="flex items-center gap-1">
											<Eye className="h-4 w-4 text-muted-foreground" />
											<span>{product.views.toLocaleString()}</span>
										</div>
										<div className="flex items-center gap-1">
											<ShoppingCart className="h-4 w-4 text-muted-foreground" />
											<span>{product.conversions}</span>
										</div>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">
											Хөрвүүлэлтийн хувь:{" "}
										</span>
										<span className="font-semibold">
											{product.conversionRate}%
										</span>
									</div>
									<div>
										<span className="text-muted-foreground">Буцаалт: </span>
										<span className="font-semibold">
											{product.returns} ширхэг
										</span>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Category Performance */}
			<Card className="border-2 border-border shadow-shadow">
				<CardHeader className="border-border border-b-2 bg-secondary-background">
					<CardTitle className="flex items-center gap-3 font-heading text-xl">
						<BarChart3 className="h-5 w-5" />
						Ангиллын гүйцэтгэл
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4">
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={mockData.categoryPerformance}
								margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
							>
								<Tooltip
									content={({ active, payload, label }) => {
										if (!active || !payload?.length) return null;

										return (
											<div className="rounded-lg border border-border bg-background p-3 shadow-lg">
												<p className="mb-2 font-medium text-sm">{label}</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Орлого:{" "}
													</span>
													<span className="font-semibold">
														{formatCurrency(payload[0].value as number)}
													</span>
												</p>
												<p className="text-sm">
													<span className="text-muted-foreground">
														Захиалга:{" "}
													</span>
													<span className="font-semibold">
														{payload[1].value} ширхэг
													</span>
												</p>
											</div>
										);
									}}
								/>
								<Bar
									dataKey="revenue"
									fill="hsl(var(--chart-1))"
									radius={[8, 8, 0, 0]}
								/>
								<XAxis
									dataKey="category"
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									tick={{ fontSize: 12 }}
									tickLine={false}
									axisLine={false}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
