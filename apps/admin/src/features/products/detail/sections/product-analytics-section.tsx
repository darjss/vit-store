import { useSuspenseQuery } from "@tanstack/react-query";
import { BarChart3, Eye, ShoppingCart, TrendingUp } from "lucide-react";
import { LineChart } from "@/components/ui/line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { calcConversionRate } from "@/features/products/detail/utils/conversion-rate";
import { trpc } from "@/utils/trpc";

export function ProductAnalyticsSection({ productId }: { productId: number }) {
	const { data: productBehavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({
			productId,
			timeRange: "weekly",
		}),
	});

	const conversionRate = calcConversionRate(productBehavior.views, productBehavior.addToCartCount);

	return (
		<div className="border-border bg-card shadow-hard border-2">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="font-heading flex items-center gap-2 text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>

			<div className="p-4">
				<div className="space-y-3">
					<div className="border-border bg-muted/20 flex items-center justify-between border-2 p-2.5">
						<div className="flex items-center gap-2">
							<Eye className="h-3.5 w-3.5 text-purple-600" />
							<span className="text-muted-foreground text-xs">Нийт үзэлт</span>
						</div>
						<span className="font-heading text-sm font-bold">
							{productBehavior.views.toLocaleString()}
						</span>
					</div>
					<div className="border-border bg-muted/20 flex items-center justify-between border-2 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-3.5 w-3.5 text-green-600" />
							<span className="text-muted-foreground text-xs">Давтагдашгүй үзэгч</span>
						</div>
						<span className="font-heading text-sm font-bold">
							{productBehavior.uniqueViewers.toLocaleString()}
						</span>
					</div>
					<div className="border-border bg-muted/20 flex items-center justify-between border-2 p-2.5">
						<div className="flex items-center gap-2">
							<ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
							<span className="text-muted-foreground text-xs">Сагсанд нэмсэн</span>
						</div>
						<span className="font-heading text-sm font-bold">
							{productBehavior.addToCartCount.toLocaleString()}
						</span>
					</div>
					<div className="border-primary bg-primary/10 flex items-center justify-between border-2 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="text-primary-foreground h-3.5 w-3.5" />
							<span className="text-xs font-medium">Хөрвүүлэлтийн хувь</span>
						</div>
						<span className="font-heading text-sm font-bold">{conversionRate}%</span>
					</div>
				</div>

				<div className="border-border bg-muted/10 mt-4 border-2 p-3">
					<h3 className="font-heading text-muted-foreground mb-2 text-xs tracking-wider uppercase">
						7 хоногийн чиг хандлага
					</h3>
					<LineChart
						categories={["views", "addToCarts"]}
						className="h-28 sm:h-32"
						data={productBehavior.dailyTrend.map((d) => ({
							addToCarts: d.addToCarts,
							date: d.date.slice(5),
							views: d.views,
						}))}
						index="date"
						strokeColors={["hsl(var(--primary))", "hsl(var(--chart-2))"]}
					/>
				</div>
			</div>
		</div>
	);
}

export function ProductBehaviorStatCards({ productId }: { productId: number }) {
	const { data: productBehavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({
			productId,
			timeRange: "weekly",
		}),
	});

	const conversionRate = calcConversionRate(productBehavior.views, productBehavior.addToCartCount);

	return (
		<>
			<div className="border-border bg-card shadow-hard-sm border-2 p-3">
				<div className="flex items-center gap-2">
					<div className="border-border flex h-8 w-8 items-center justify-center border-2 bg-purple-100">
						<Eye className="h-4 w-4 text-purple-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-heading text-sm font-bold sm:text-base">
							{productBehavior.views.toLocaleString()}
						</p>
						<p className="text-muted-foreground text-xs">Үзэлт</p>
					</div>
				</div>
			</div>
			<div className="border-border bg-card shadow-hard-sm border-2 p-3">
				<div className="flex items-center gap-2">
					<div className="border-border flex h-8 w-8 items-center justify-center border-2 bg-blue-100">
						<ShoppingCart className="h-4 w-4 text-blue-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-heading text-sm font-bold sm:text-base">{conversionRate}%</p>
						<p className="text-muted-foreground text-xs">Хувь</p>
					</div>
				</div>
			</div>
		</>
	);
}

export function AnalyticsSkeleton() {
	return (
		<div className="border-border bg-card shadow-hard border-2">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="font-heading flex items-center gap-2 text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>
			<div className="p-4">
				<div className="space-y-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							className="border-border bg-muted/20 flex items-center justify-between border-2 p-2.5"
							key={i}
						>
							<div className="flex items-center gap-2">
								<Skeleton className="h-3.5 w-3.5" />
								<Skeleton className="h-3 w-20" />
							</div>
							<Skeleton className="h-4 w-10" />
						</div>
					))}
				</div>
				<div className="border-border bg-muted/10 mt-4 border-2 p-3">
					<Skeleton className="mb-2 h-3 w-32" />
					<Skeleton className="h-28 w-full sm:h-32" />
				</div>
			</div>
		</div>
	);
}
