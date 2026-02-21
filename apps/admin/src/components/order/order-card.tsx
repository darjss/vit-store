import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { OrderStatusType } from "@vit/shared";
import { CheckCircle, Copy, MapPin, Package, Phone, Truck } from "lucide-react";
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

	const productCount = order.products?.length ?? 0;

	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent
					data-no-nav
					className="max-w-[95vw] sm:max-w-[600px] lg:max-w-[640px]"
				>
					<DialogHeader>
						<DialogTitle>Захиалга засах</DialogTitle>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-3 sm:p-4">
						<OrderForm
							order={{ ...order, isNewCustomer: false }}
							onSuccess={() => setIsEditDialogOpen(false)}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Card
				className="cursor-pointer transition-all duration-150 hover:translate-y-[-2px] active:translate-y-0"
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
				<CardContent className="flex flex-col gap-0 p-0">
					{/* Header: Order number + status badges */}
					<div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<span className="font-bold text-foreground text-sm tracking-tight">
									#{order.orderNumber}
								</span>
								<span className="text-[11px] text-muted-foreground">
									{new Date(order.createdAt).toLocaleDateString("mn-MN", {
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
							</div>
							<div className="mt-1 flex items-center gap-1.5">
								<Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
								<span className="font-medium text-foreground text-xs tabular-nums">
									{order.customerPhone}
								</span>
							</div>
						</div>
						<div className="flex shrink-0 flex-col items-end gap-1">
							<OrderStatusBadge status={order.status} />
							{order.paymentStatus && order.paymentProvider && (
								<Badge
									variant="outline"
									className={`flex h-5 items-center gap-1 border-2 px-1.5 text-[10px] leading-none ${getPaymentStatusColor(order.paymentStatus)}`}
								>
									<span className="text-[10px] leading-none">
										{getPaymentProviderIcon(order.paymentProvider)}
									</span>
									<span className="font-bold">
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

					{/* Address row */}
					<div className="flex items-center gap-1.5 border-border border-t border-dashed px-3 py-1.5">
						<MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
							{order.address || "Хаяг оруулаагүй"}
						</span>
						<Button
							size="icon"
							variant="ghost"
							className="h-6 w-6 shrink-0"
							data-no-nav
							onClick={async () => {
								await navigator.clipboard.writeText(order.address);
								toast("Хаяг хуулагдлаа");
							}}
						>
							<Copy className="h-3 w-3" />
						</Button>
					</div>

					{/* Products list */}
					<div className="border-border border-t px-3 py-2">
						<div className="flex items-center justify-between pb-1.5">
							<div className="flex items-center gap-1.5">
								<Package className="h-3 w-3 text-muted-foreground" />
								<span className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
									Бүтээгдэхүүн
								</span>
								<span className="flex h-4 min-w-4 items-center justify-center border-2 border-border bg-muted px-1 font-bold text-[10px] text-foreground">
									{productCount}
								</span>
							</div>
							<span className="font-bold text-foreground text-sm tabular-nums">
								₮{order.total.toLocaleString()}
							</span>
						</div>

						<div className="flex flex-col gap-1.5">
							{order.products?.map((detail, index) => (
								<div
									key={order.orderNumber + detail.productId + index}
									className="flex items-center gap-2 border-2 border-border/50 bg-muted/30 p-1.5"
								>
									<div className="h-10 w-10 shrink-0 overflow-hidden border-2 border-border/50 bg-muted sm:h-11 sm:w-11">
										<img
											src={detail.imageUrl || "/placeholder.jpg"}
											alt={detail.name}
											className="h-full w-full object-cover"
											loading="lazy"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-bold text-foreground text-xs leading-tight">
											{detail.name}
										</p>
									</div>
									<span className="shrink-0 border-2 border-border bg-background px-1.5 py-0.5 font-bold text-[11px] text-foreground tabular-nums">
										x{detail.quantity}
									</span>
								</div>
							))}
						</div>
					</div>

					{/* Footer: actions */}
					<div
						className="flex items-center justify-end gap-2 border-border border-t px-3 py-2"
						data-no-nav
					>
						{order.status === "pending" && (
							<Button
								variant="default"
								size="sm"
								className="mr-auto h-7 gap-1.5 border-2 border-border px-2.5 font-bold text-xs"
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
								className="mr-auto h-7 gap-1.5 border-2 border-border px-2.5 font-bold text-xs"
								onClick={() => handleUpdateOrder("delivered")}
							>
								<CheckCircle className="h-3 w-3" />
								<span>Хүргэсэн</span>
							</Button>
						)}
						<RowActions
							id={order.id}
							setIsEditDialogOpen={setIsEditDialogOpen}
							deleteMutation={() => deleteOrderHandler(order.id)}
							isDeletePending={isDeletePending}
						/>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default OrderCard;
