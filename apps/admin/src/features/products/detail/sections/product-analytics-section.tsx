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

	const conversionRate = calcConversionRate(
		productBehavior.views,
		productBehavior.addToCartCount,
	);

	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>

			<div className="p-4">
				<div className="space-y-3">
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<Eye className="h-3.5 w-3.5 text-purple-600" />
							<span className="text-muted-foreground text-xs">Нийт үзэлт</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.views.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-3.5 w-3.5 text-green-600" />
							<span className="text-muted-foreground text-xs">
								Давтагдашгүй үзэгч
							</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.uniqueViewers.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
							<span className="text-muted-foreground text-xs">
								Сагсанд нэмсэн
							</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.addToCartCount.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-primary bg-primary/10 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-3.5 w-3.5 text-primary-foreground" />
							<span className="font-medium text-xs">Хөрвүүлэлтийн хувь</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{conversionRate}%
						</span>
					</div>
				</div>

				<div className="mt-4 border-2 border-border bg-muted/10 p-3">
					<h3 className="mb-2 font-heading text-muted-foreground text-xs uppercase tracking-wider">
						7 хоногийн чиг хандлага
					</h3>
					<LineChart
						data={productBehavior.dailyTrend.map((d) => ({
							date: d.date.slice(5),
							views: d.views,
							addToCarts: d.addToCarts,
						}))}
						index="date"
						categories={["views", "addToCarts"]}
						strokeColors={["hsl(var(--primary))", "hsl(var(--chart-2))"]}
						className="h-28 sm:h-32"
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

	const conversionRate = calcConversionRate(
		productBehavior.views,
		productBehavior.addToCartCount,
	);

	return (
		<>
			<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-purple-100">
						<Eye className="h-4 w-4 text-purple-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-bold font-heading text-sm sm:text-base">
							{productBehavior.views.toLocaleString()}
						</p>
						<p className="text-muted-foreground text-xs">Үзэлт</p>
					</div>
				</div>
			</div>
			<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-blue-100">
						<ShoppingCart className="h-4 w-4 text-blue-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-bold font-heading text-sm sm:text-base">
							{conversionRate}%
						</p>
						<p className="text-muted-foreground text-xs">Хувь</p>
					</div>
				</div>
			</div>
		</>
	);
}

export function AnalyticsSkeleton() {
	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>
			<div className="p-4">
				<div className="space-y-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5"
						>
							<div className="flex items-center gap-2">
								<Skeleton className="h-3.5 w-3.5" />
								<Skeleton className="h-3 w-20" />
							</div>
							<Skeleton className="h-4 w-10" />
						</div>
					))}
				</div>
				<div className="mt-4 border-2 border-border bg-muted/10 p-3">
					<Skeleton className="mb-2 h-3 w-32" />
					<Skeleton className="h-28 w-full sm:h-32" />
				</div>
			</div>
		</div>
	);
}
