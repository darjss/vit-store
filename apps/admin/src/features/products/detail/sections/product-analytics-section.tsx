import { useSuspenseQuery } from "@tanstack/react-query";
import { LineChart } from "@/components/ui/line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";

export function ProductAnalyticsSection({ productId }: { productId: number }) {
	const { data: productBehavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({
			productId,
			timeRange: "weekly",
		}),
	});

	return (
		<section className="border bg-white">
			<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
				Дэлгүүрт, 7 хоног
			</h2>
			<dl className="grid grid-cols-3 divide-x border-b text-center">
				<Stat label="үзэлт" value={productBehavior.views} />
				<Stat label="хүн" value={productBehavior.uniqueViewers} />
				<Stat label="сагсанд" value={productBehavior.addToCartCount} />
			</dl>
			{productBehavior.views === 0 ? (
				<p className="text-muted-foreground px-4 py-4 text-center text-sm">
					Энэ 7 хоногт хэн ч үзээгүй
				</p>
			) : (
				<div className="px-2 py-3">
					<LineChart
						categories={["views", "addToCarts"]}
						className="h-28"
						data={productBehavior.dailyTrend.map((d) => ({
							addToCarts: d.addToCarts,
							date: d.date.slice(5),
							views: d.views,
						}))}
						index="date"
						strokeColors={["hsl(var(--primary))", "hsl(var(--chart-2))"]}
					/>
				</div>
			)}
		</section>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="px-2 py-2">
			<dd className="text-base font-semibold tabular-nums">{value.toLocaleString("en-US")}</dd>
			<dt className="text-muted-foreground text-xs">{label}</dt>
		</div>
	);
}

export function AnalyticsSkeleton() {
	return (
		<section className="border bg-white p-4">
			<Skeleton className="mb-3 h-3 w-32" />
			<Skeleton className="h-28 w-full" />
		</section>
	);
}
