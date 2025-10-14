import { useSuspenseQuery } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { Clock, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export function PendingOrders() {
	const { data: orders } = useSuspenseQuery(
		trpc.order.getPendingOrders.queryOptions(),
	);

	return (
		<Card className="border-2 border-border shadow-lg">
			<CardHeader className="border-border border-b-2 bg-secondary-background p-4 sm:p-6">
				<CardTitle className="flex items-center gap-3 font-heading text-xl sm:text-2xl">
					<Clock className="h-6 w-6 flex-shrink-0" />
					Хүлээгдэж буй захиалгууд
				</CardTitle>
			</CardHeader>
			<CardContent className="p-3 sm:p-4">
				<div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
					{orders.map((order) => (
						<div
							key={order.id}
							className="group rounded-lg border-2 border-border bg-card p-3 shadow-md transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-lg sm:p-4"
						>
							<div className="flex flex-col gap-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
									<div className="flex flex-col gap-2 text-sm">
										<div className="flex items-start gap-2">
											<MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
											<span className="font-medium text-foreground leading-tight">
												{order.address}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
											<span className="text-foreground">
												{order.customerPhone}
											</span>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
									{order.products?.slice(0, 4).map((product, index) => (
										<div
											key={product.productId || index}
											className="flex flex-col items-center gap-1.5 rounded-md border-2 border-border bg-background p-2 shadow-sm transition-shadow hover:shadow-md sm:flex-row"
										>
											{product.imageUrl ? (
												<Image
													src={product.imageUrl || "/placeholder.svg"}
													alt={product.name}
													width={40}
													height={60}
													className="h-14 w-10 rounded-sm border border-border object-cover"
												/>
											) : (
												<div className="h-14 w-10 rounded-sm border border-border bg-muted" />
											)}
											<span className="rounded bg-primary px-1.5 py-0.5 font-bold font-heading text-primary-foreground text-xs">
												x{product.quantity}
											</span>
										</div>
									))}
									{order.products && order.products.length > 4 && (
										<div className="flex items-center justify-center rounded-md border-2 border-border bg-secondary px-3 py-2 shadow-sm">
											<span className="font-bold font-heading text-secondary-foreground text-sm">
												+{order.products.length - 4}
											</span>
										</div>
									)}
								</div>

								<div className="flex flex-col gap-2 border-border border-t-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex items-center gap-2">
										<Clock className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="text-muted-foreground text-xs">
											{new Date(order.createdAt).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</div>
									<div className="inline-flex w-fit items-center rounded-md border-2 border-border bg-primary px-3 py-1.5 shadow-sm">
										<span className="font-bold font-heading text-lg text-primary-foreground">
											₮{order.total.toLocaleString()}
										</span>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
