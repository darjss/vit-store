import {
	Package,
	Phone,
	Calendar,
	DollarSign,
	MapPin,
	CheckCircle,
	Truck,
	Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderType } from "@/lib/types";
import RowActions from "@/components/row-actions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
	getPaymentProviderIcon,
	getPaymentStatusColor,
	getOrderStatusStyles,
} from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import OrderForm from "./order-form";
import { trpc } from "@/utils/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { OrderStatusType } from "@server/lib/types";

const OrderCard = ({ order }: { order: OrderType }) => {
	const statusStyles = getOrderStatusStyles(order.status);
	const navigate = useNavigate();
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const queryClient = useQueryClient();
	const updateOrder = useMutation({
		...trpc.order.updateOrderStatus.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				...trpc.order.getPaginatedOrders.queryKey,
			});
			toast.success("захиалга амжилттай засагдлаа");
		},
	});
	const { mutate: deleteOrder, isPending: isDeletePending } = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				...trpc.order.getPaginatedOrders.queryKey,
			});

			toast.success("захиалга амжилттай устгагдлаа");
		},
	});
	const deleteOrderHandler = async (id: number) => {
		deleteOrder({ id });
	};

	const handleUpdateOrder = (status: OrderStatusType) => {
		updateOrder.mutate({ id: order.id, status });
	};
	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent data-no-nav>
					<DialogHeader>
						<DialogTitle>Захиалга засах</DialogTitle>
					</DialogHeader>
					<OrderForm
						order={{ ...order, isNewCustomer: false }}
						onSuccess={() => setIsEditDialogOpen(false)}
					/>
				</DialogContent>
			</Dialog>
			<Card
				className={`border-l-4 transition-shadow duration-200 hover:shadow-md ${statusStyles.border} h-64 sm:h-72 md:h-80`}
				onClick={(e) => {
					if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
					navigate({ to: "/orders/$id", params: { id: order.id } });
				}}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						!(e.target as HTMLElement).closest("[data-no-nav]")
					) {
						navigate({ to: "/orders/$id", params: { id: order.id } });
					}
				}}
			>
				<CardContent className="p-0 h-full flex flex-col">
					<div className="flex items-center justify-between gap-2 border-b bg-muted/5 p-3">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<Phone className="h-4 w-4 text-primary" />
								<h3 className="text-base font-semibold">
									{order.customerPhone}
								</h3>
							</div>
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<div className="flex items-center gap-1">
									<Package className="h-3 w-3" />
									<span className="font-medium">#{order.orderNumber}</span>
								</div>
								<div className="flex items-center gap-1">
									<Calendar className="h-3 w-3" />
									<span>{new Date(order.createdAt).toLocaleDateString()}</span>
								</div>
							</div>
						</div>

						<div className="flex flex-col items-end gap-1">
							<Badge
								className={`${statusStyles.badge} px-2 py-0.5 text-xs shadow-sm`}
							>
								{order.status.charAt(0).toUpperCase() + order.status.slice(1)}
							</Badge>

							{order.paymentStatus && order.status && order.paymentProvider && (
								<Badge
									className={`flex h-5 items-center gap-1.5 rounded-md px-2 text-[10px] shadow-sm ${getPaymentStatusColor(
										order.paymentStatus,
									)}`}
								>
									<span>{getPaymentProviderIcon(order.paymentProvider)}</span>
									<span>
										{order.paymentStatus === "success"
											? "Paid"
											: order.paymentStatus === "failed"
												? "Failed"
												: "Pending"}
									</span>
								</Badge>
							)}
						</div>
					</div>

					<div className="border-b bg-muted/5 px-3 py-2">
						<div className="flex items-center gap-1">
							<MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
							<span className="text-sm font-semibold">
								{order.address || "No address provided"}
							</span>
							<Button
								size={"icon"}
								className="h-7 w-7"
								variant={"default"}
								data-no-nav
								onClick={async () => {
									await navigator.clipboard.writeText(order.address);
									toast("Хаяг хуулагдлаа");
								}}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
					</div>

					<div className="p-3 flex-1 overflow-y-auto">
						<div className="flex h-full flex-col sm:gap-4">
							<div className="w-full flex-1 flex flex-col overflow-hidden">
								<div className="mb-2 flex items-center justify-between shrink-0">
									<div className="flex items-center gap-2">
										<h4 className="text-xs font-medium text-muted-foreground">
											Бүтээгдэхүүн
										</h4>
										<span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-xs">
											{order.products?.length}
										</span>
									</div>
									<span className="flex items-center gap-1 text-sm font-bold text-primary">
										<DollarSign className="h-3.5 w-3.5" />₮
										{order.total.toFixed(2)}
									</span>
								</div>

								<div className="grid flex-1 grid-cols-2 gap-1.5 overflow-auto pr-1">
									{order.products?.map((detail, index) => (
										<div
											key={order.orderNumber + detail.productId + index}
											className="flex items-center gap-1.5 rounded border bg-card p-1.5 text-xs"
										>
											<div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded bg-muted/10">
												<img
													src={detail.imageUrl || "/placeholder.jpg"}
													alt={detail.name}
													className="h-full w-full object-cover"
													loading="lazy"
												/>
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-xs font-medium">
													{detail.name}
												</p>
												<span className="text-xs text-muted-foreground">
													x{detail.quantity}
												</span>
											</div>
										</div>
									))}
								</div>

								<div
									className="flex items-center justify-between gap-2 border-t pt-1 shrink-0"
									data-no-nav
								>
									{order.status === "pending" && (
										<Button
											variant="default"
											size="sm"
											className="h-7 gap-1 px-2 text-xs"
											onClick={() => handleUpdateOrder("shipped")}
										>
											<Truck className="h-3 w-3" />
											<span>Илгээсэн</span>
										</Button>
									)}
									{order.status === "shipped" && (
										<Button
											variant="default"
											size="sm"
											className="h-7 gap-1 px-2 text-xs"
											onClick={() => handleUpdateOrder("delivered")}
										>
											<CheckCircle className="h-3 w-3" />
											<span>Хүргэсэн</span>
										</Button>
									)}
									<div></div>
									<RowActions
										id={order.id}
										setIsEditDialogOpen={setIsEditDialogOpen}
										deleteMutation={() => deleteOrderHandler(order.id)}
										isDeletePending={isDeletePending}
									/>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default OrderCard;
