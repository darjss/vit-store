import { Clock, Phone, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockData } from "@/lib/mock-data";
import { OrderStatusBadge } from "./order-status-badge";

export function PendingOrders() {
	return (
		<Card className="border-2 border-border shadow-shadow">
			<CardHeader className="border-border border-b-2 bg-secondary-background">
				<CardTitle className="flex items-center gap-3 font-heading text-xl">
					<Clock className="h-5 w-5" />
					Сүүлийн захиалгууд
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4">
				<div className="max-h-96 space-y-3 overflow-y-auto">
					{mockData.recentOrders.map((order) => (
						<div
							key={order.id}
							className="border-2 border-border bg-card shadow-sm transition-shadow hover:shadow-md"
						>
							<div className="p-4">
								<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div className="flex-1">
										<div className="mb-2 flex items-center gap-3">
											<span className="border border-border bg-primary px-2 py-1 font-bold font-heading text-sm">
												{order.orderNumber}
											</span>
											<OrderStatusBadge status={order.status} />
										</div>
										<div className="flex items-center gap-4 text-sm">
											<div className="flex items-center gap-2">
												<User className="h-4 w-4" />
												<span className="font-medium">
													{order.customerName}
												</span>
											</div>
											<div className="flex items-center gap-2">
												<Phone className="h-4 w-4" />
												<span>{order.customerPhone}</span>
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="font-bold font-heading text-lg">
											₮{order.total.toLocaleString()}
										</div>
										<div className="text-muted-foreground text-xs">
											{new Date(order.createdAt).toLocaleTimeString()}
										</div>
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
