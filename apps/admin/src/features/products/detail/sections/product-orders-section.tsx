import { useSuspenseQuery } from "@tanstack/react-query";
import { Calendar, Phone, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function ProductOrdersSection({ productId }: { productId: number }) {
	const { data: orders } = useSuspenseQuery({
		...trpc.order.getRecentOrdersByProductId.queryOptions({
			productId,
		}),
	});

	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<Calendar className="h-4 w-4" />
					Сүүлийн захиалгууд
				</h2>
			</div>

			<div className="divide-y-2 divide-border">
				{orders.length > 0 ? (
					orders.map((order) => (
						<div
							key={order.orderNumber}
							className="px-4 py-3 transition-colors hover:bg-muted/20"
						>
							<div className="mb-1.5 flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<Phone className="h-3 w-3 text-muted-foreground" />
									<span className="font-medium text-sm">
										{order.customerPhone}
									</span>
								</div>
								<Badge className="bg-green-100 text-green-800 text-xs">
									{order.status}
								</Badge>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<Calendar className="h-3 w-3" />
									<span>{formatDateToText(order.createdAt)}</span>
								</div>
								<span className="font-bold font-heading text-primary-foreground text-sm">
									{formatCurrency(order.total)}
								</span>
							</div>
							<p className="mt-0.5 font-mono text-muted-foreground text-xs">
								{order.orderNumber}
							</p>
						</div>
					))
				) : (
					<div className="px-4 py-8 text-center">
						<ShoppingCart className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
						<p className="text-muted-foreground text-sm">Захиалга байхгүй</p>
					</div>
				)}
			</div>

			{orders.length > 0 && (
				<div className="border-border border-t-2 p-3">
					<Button variant="outline" size="sm" className="w-full text-xs">
						Бүх захиалгыг харах
					</Button>
				</div>
			)}
		</div>
	);
}

export function OrdersSkeleton() {
	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<Calendar className="h-4 w-4" />
					Сүүлийн захиалгууд
				</h2>
			</div>
			<div className="divide-y-2 divide-border">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={i} className="px-4 py-3">
						<div className="mb-1.5 flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-3 w-3" />
								<Skeleton className="h-4 w-24" />
							</div>
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
						<div className="flex items-center justify-between">
							<Skeleton className="h-3 w-28" />
							<Skeleton className="h-4 w-16" />
						</div>
						<Skeleton className="mt-1 h-3 w-32" />
					</div>
				))}
			</div>
		</div>
	);
}
