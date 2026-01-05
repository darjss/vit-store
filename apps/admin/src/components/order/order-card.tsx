import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { OrderStatusType } from "@vit/shared";
import {
	Calendar,
	CheckCircle,
	Copy,
	DollarSign,
	MapPin,
	Package,
	Phone,
	Truck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import RowActions from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { OrderType } from "@/lib/types";
import { getPaymentProviderIcon, getPaymentStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import OrderForm from "./order-form";

const OrderCard = ({ order }: { order: OrderType }) => {
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
				className={
					"h-auto min-h-[320px] border-l-4 border-l-gray-400 transition-shadow duration-200 hover:shadow-md sm:min-h-[360px] md:min-h-[400px]"
				}
				onClick={(e) => {
					if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
					navigate({ to: "/orders/$id", params: { id: order.id.toString() } });
				}}
				tabIndex={0}
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						!(e.target as HTMLElement).closest("[data-no-nav]")
					) {
						navigate({
							to: "/orders/$id",
							params: { id: order.id.toString() },
						});
					}
				}}
			>
				<CardContent className="flex h-full flex-col p-0">
					<div className="flex items-center justify-between gap-2 border-b bg-muted/5 p-3">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<Phone className="h-4 w-4 text-primary" />
								<h3 className="font-semibold text-base">
									{order.customerPhone}
								</h3>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
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
							<OrderStatusBadge status={order.status} />

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
							<span className="font-semibold text-sm">
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

					<div className="flex-1 overflow-y-auto p-3">
						<div className="flex h-full flex-col sm:gap-4">
							<div className="flex w-full flex-1 flex-col overflow-hidden">
								<div className="mb-2 flex shrink-0 items-center justify-between">
									<div className="flex items-center gap-2">
										<h4 className="font-medium text-muted-foreground text-xs">
											Бүтээгдэхүүн
										</h4>
										<span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-xs">
											{order.products?.length}
										</span>
									</div>
									<span className="flex items-center gap-1 font-bold text-primary text-sm">
										<DollarSign className="h-3.5 w-3.5" />₮
										{order.total.toFixed(2)}
									</span>
								</div>

								<div className="grid flex-1 grid-cols-2 gap-2 overflow-auto pr-1">
									{order.products?.map((detail, index) => (
										<div
											key={order.orderNumber + detail.productId + index}
											className="flex items-center gap-2 rounded border bg-card p-2 sm:p-2.5"
										>
											<div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-muted/10 sm:h-20 sm:w-20">
												<img
													src={detail.imageUrl || "/placeholder.jpg"}
													alt={detail.name}
													className="h-full w-full object-cover"
													loading="lazy"
												/>
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-sm sm:text-base">
													{detail.name}
												</p>
												<span className="text-muted-foreground text-xs sm:text-sm">
													x{detail.quantity}
												</span>
											</div>
										</div>
									))}
								</div>

								<div
									className="flex shrink-0 items-center justify-between gap-2 border-t pt-1"
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
									<div />
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
