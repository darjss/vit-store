import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Ulaanbaatar",
});

export function ProductOrdersSection({ productId }: { productId: number }) {
	const { data: orders } = useSuspenseQuery({
		...trpc.order.getRecentOrdersByProductId.queryOptions({
			productId,
		}),
	});

	return (
		<section className="border bg-white">
			<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
				Сүүлийн захиалга
			</h2>
			{orders.length > 0 ? (
				<ul className="divide-y">
					{orders.map((order) => (
						<li key={order.id}>
							<Link
								className="active:bg-muted hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5"
								params={{ id: String(order.id) }}
								to="/orders/$id"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium">#{order.orderNumber}</p>
									<p className="text-muted-foreground text-xs tabular-nums">
										{dateFormat.format(new Date(order.createdAt))} · {formatCurrency(order.total)}
									</p>
								</div>
								<OrderStatusBadge status={order.status} />
							</Link>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground px-4 py-6 text-center text-sm">Захиалга алга</p>
			)}
		</section>
	);
}

export function OrdersSkeleton() {
	return (
		<section className="space-y-3 border bg-white p-4">
			<Skeleton className="h-3 w-32" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
		</section>
	);
}
