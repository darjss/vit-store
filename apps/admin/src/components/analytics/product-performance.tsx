import { Eye, Search, ShoppingCart } from "lucide-react";

interface MostViewedProduct {
	productId: number;
	productName: string;
	productSlug: string;
	views: number;
	uniqueViewers: number;
	addToCartCount: number;
}

interface TopSearch {
	query: string;
	count: number;
	avgResults: number;
	noResultCount: number;
}

interface ProductPerformanceProps {
	mostViewedProducts: MostViewedProduct[];
	topSearches: TopSearch[];
	timeRangeLabel: string;
}

export function ProductPerformance({
	mostViewedProducts,
	topSearches,
	timeRangeLabel,
}: ProductPerformanceProps) {
	return (
		<div className="space-y-3">
			{/* Most Viewed Products */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<Eye className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">
							Хамгийн их үзэгдсэн бүтээгдэхүүн
						</span>
					</div>
					<span className="text-muted-foreground text-xs">
						{timeRangeLabel}
					</span>
				</div>
				{mostViewedProducts.length > 0 ? (
					<div className="divide-y divide-border">
						{mostViewedProducts.map((product, index) => {
							const maxViews = mostViewedProducts[0]?.views || 1;
							const widthPct = (product.views / maxViews) * 100;
							const convRate =
								product.views > 0
									? ((product.addToCartCount / product.views) * 100).toFixed(1)
									: "0.0";
							return (
								<div key={product.productId} className="relative p-2.5">
									<div
										className="absolute inset-y-0 left-0 bg-primary/10"
										style={{ width: `${widthPct}%` }}
									/>
									<div className="relative flex items-center justify-between">
										<div className="flex items-center gap-2.5">
											<div className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-border bg-card font-bold font-heading text-xs">
												{index + 1}
											</div>
											<div className="min-w-0">
												<p className="truncate font-bold text-sm leading-tight">
													{product.productName}
												</p>
												<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
													<span className="flex items-center gap-0.5">
														<Eye className="h-2.5 w-2.5" />
														{product.views.toLocaleString()} үзэлт
													</span>
													<span>•</span>
													<span className="flex items-center gap-0.5">
														<ShoppingCart className="h-2.5 w-2.5" />
														{product.addToCartCount} сагс
													</span>
													<span>•</span>
													<span>{convRate}%</span>
												</div>
											</div>
										</div>
										<span className="shrink-0 font-bold font-mono text-xs">
											{product.uniqueViewers.toLocaleString()} хүн
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Өгөгдөл байхгүй
					</div>
				)}
			</div>

			{/* Top Searches */}
			<div className="border-2 border-border bg-card shadow-hard-sm">
				<div className="flex items-center justify-between border-border border-b-2 bg-muted/30 px-3 py-2">
					<div className="flex items-center gap-2">
						<Search className="h-4 w-4 text-muted-foreground" />
						<span className="font-bold text-sm">Топ хайлтууд</span>
					</div>
					<span className="text-muted-foreground text-xs">
						{timeRangeLabel}
					</span>
				</div>
				{topSearches.length > 0 ? (
					<div className="divide-y divide-border">
						{topSearches.map((search, index) => {
							const maxCount = topSearches[0]?.count || 1;
							const widthPct = (search.count / maxCount) * 100;
							return (
								<div key={search.query} className="relative p-2.5">
									<div
										className="absolute inset-y-0 left-0 bg-chart-2/10"
										style={{ width: `${widthPct}%` }}
									/>
									<div className="relative flex items-center justify-between">
										<div className="flex items-center gap-2.5">
											<div className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-border bg-card font-bold font-heading text-xs">
												{index + 1}
											</div>
											<div className="min-w-0">
												<p className="truncate font-bold text-sm leading-tight">
													"{search.query}"
												</p>
												<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
													<span>{search.count} удаа хайсан</span>
													{search.noResultCount > 0 && (
														<>
															<span>•</span>
															<span className="text-orange-600">
																{search.noResultCount} үр дүнгүй
															</span>
														</>
													)}
												</div>
											</div>
										</div>
										<span className="shrink-0 font-mono text-muted-foreground text-xs">
											~{Math.round(search.avgResults)} үр дүн
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="p-6 text-center text-muted-foreground text-sm">
						Хайлтын өгөгдөл байхгүй
					</div>
				)}
			</div>
		</div>
	);
}
