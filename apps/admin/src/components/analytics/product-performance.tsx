import { Eye, Search, ShoppingCart } from "lucide-react";

interface MostViewedProduct {
	addToCartCount: number;
	productId: number;
	productName: string;
	productSlug: string;
	uniqueViewers: number;
	views: number;
}

interface TopSearch {
	avgResults: number;
	count: number;
	noResultCount: number;
	query: string;
}

interface ProductPerformanceProps {
	mostViewedProducts: Array<MostViewedProduct>;
	timeRangeLabel: string;
	topSearches: Array<TopSearch>;
}

export function ProductPerformance({
	mostViewedProducts,
	timeRangeLabel,
	topSearches,
}: ProductPerformanceProps) {
	return (
		<div className="space-y-3">
			{/* Most Viewed Products */}
			<div className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
					<div className="flex items-center gap-2">
						<Eye className="text-muted-foreground h-4 w-4" />
						<span className="text-sm font-bold">Хамгийн их үзэгдсэн бүтээгдэхүүн</span>
					</div>
					<span className="text-muted-foreground text-xs">{timeRangeLabel}</span>
				</div>
				{mostViewedProducts.length > 0 ? (
					<div className="divide-border divide-y">
						{mostViewedProducts.map((product, index) => {
							const maxViews = mostViewedProducts[0]?.views || 1;
							const widthPct = (product.views / maxViews) * 100;
							const convRate =
								product.views > 0
									? ((product.addToCartCount / product.views) * 100).toFixed(1)
									: "0.0";
							return (
								<div className="relative p-2.5" key={product.productId}>
									<div
										className="bg-primary/10 absolute inset-y-0 left-0"
										style={{ width: `${widthPct}%` }}
									/>
									<div className="relative flex items-center justify-between">
										<div className="flex items-center gap-2.5">
											<div className="border-border bg-card font-heading flex h-6 w-6 shrink-0 items-center justify-center border-2 text-xs font-bold">
												{index + 1}
											</div>
											<div className="min-w-0">
												<p className="truncate text-sm leading-tight font-bold">
													{product.productName}
												</p>
												<div className="text-muted-foreground flex items-center gap-2 text-[10px]">
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
										<span className="shrink-0 font-mono text-xs font-bold">
											{product.uniqueViewers.toLocaleString()} хүн
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="text-muted-foreground p-6 text-center text-sm">Өгөгдөл байхгүй</div>
				)}
			</div>

			{/* Top Searches */}
			<div className="border-border bg-card shadow-hard-sm border-2">
				<div className="border-border bg-muted/30 flex items-center justify-between border-b-2 px-3 py-2">
					<div className="flex items-center gap-2">
						<Search className="text-muted-foreground h-4 w-4" />
						<span className="text-sm font-bold">Топ хайлтууд</span>
					</div>
					<span className="text-muted-foreground text-xs">{timeRangeLabel}</span>
				</div>
				{topSearches.length > 0 ? (
					<div className="divide-border divide-y">
						{topSearches.map((search, index) => {
							const maxCount = topSearches[0]?.count || 1;
							const widthPct = (search.count / maxCount) * 100;
							return (
								<div className="relative p-2.5" key={search.query}>
									<div
										className="bg-chart-2/10 absolute inset-y-0 left-0"
										style={{ width: `${widthPct}%` }}
									/>
									<div className="relative flex items-center justify-between">
										<div className="flex items-center gap-2.5">
											<div className="border-border bg-card font-heading flex h-6 w-6 shrink-0 items-center justify-center border-2 text-xs font-bold">
												{index + 1}
											</div>
											<div className="min-w-0">
												<p className="truncate text-sm leading-tight font-bold">
													&ldquo;{search.query}&rdquo;
												</p>
												<div className="text-muted-foreground flex items-center gap-2 text-[10px]">
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
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											~{Math.round(search.avgResults)} үр дүн
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="text-muted-foreground p-6 text-center text-sm">
						Хайлтын өгөгдөл байхгүй
					</div>
				)}
			</div>
		</div>
	);
}
