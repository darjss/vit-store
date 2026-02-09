import { useSuspenseQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export function PendingOrders() {
	const { data: orders } = useSuspenseQuery(
		trpc.order.getPendingOrders.queryOptions(),
	);

	return (
		<Card className="h-full border-2 border-border shadow-hard">
			<CardHeader className="border-border border-b-2 bg-muted/20">
				<CardTitle className="flex items-center gap-2">
					<Clock className="h-5 w-5" />
					Хүлээгдэж буй захиалгууд
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<div className="divide-y-2 divide-border">
					{orders.length === 0 && (
						<div className="p-8 text-center text-muted-foreground">
							Одоогоор шинэ захиалга байхгүй байна.
						</div>
					)}
					{orders.map((order) => (
						<div
							key={order.id}
							className="group flex flex-col gap-3 p-4 transition-colors hover:bg-muted/10"
						>
							<div className="flex items-start justify-between">
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<Badge variant="surface" className="shadow-hard-sm">
											#{String(order.id).slice(-4)}
										</Badge>
										<span className="font-medium text-xs">
											{formatDateToText(order.createdAt)}
										</span>
									</div>
									<div className="flex items-center gap-2 text-sm">
										<Phone className="h-3.5 w-3.5 text-muted-foreground" />
										<span>{order.customerPhone}</span>
									</div>
								</div>
								<div className="text-right">
									<div className="font-black font-heading text-lg">
										₮{order.total.toLocaleString()}
									</div>
									<div className="text-muted-foreground text-xs">
										{order.products?.length || 0} бараа
									</div>
								</div>
							</div>

							<div className="flex items-start gap-2 text-muted-foreground text-xs">
								<MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								<span className="line-clamp-2">{order.address}</span>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
