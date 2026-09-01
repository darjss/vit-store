import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle, Copy, Loader2, MapPin, Package, Phone, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import RowActions from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { paymentStatusLabel } from "@/lib/enum-labels";
import { labelForOrderStatus } from "@/lib/order-status-display";
import type { OrderType } from "@/lib/types";
import { getPaymentProviderIcon, getPaymentStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import OrderForm from "./order-form";
import { TransferPaymentActions } from "./pending-transfer-dialog";
import ShipOrderDialog from "./ship-order-dialog";

const statusBorderColor = {
	cancelled: "border-t-[#dc2626]",
	created: "border-t-[#64748b]",
	delivered: "border-t-[#059669]",
	pending: "border-t-[#d97706]",
	refunded: "border-t-[#7c3aed]",
	shipped: "border-t-[#2563eb]",
} satisfies Partial<Record<OrderType["status"], string>>;

interface OrderCardProps {
	order: OrderType;
	selection?: {
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
	};
}

export default function OrderCard({ order, selection }: OrderCardProps) {
	const navigate = useNavigate();
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
	const [productsExpanded, setProductsExpanded] = useState(false);
	const [previewImage, setPreviewImage] = useState<{
		alt: string;
		src: string;
	} | null>(null);
	const queryClient = useQueryClient();

	const updateOrderStatus = useMutation({
		...trpc.order.updateOrderStatus.mutationOptions(),
		onSuccess: () => {
			void queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
			toast.success("Захиалгын төлөв амжилттай шинэчлэгдлээ");
		},
	});

	const deleteOrder = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onError: () => {
			toast.error("Захиалга устгахад алдаа гарлаа");
		},
		onSettled: () => {
			void queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
		},
		onSuccess: () => {
			toast.success("Захиалга амжилттай устгагдлаа");
		},
	});

	const products = order.products ?? [];
	const productCount = products.length;
	const borderColor = statusBorderColor[order.status] ?? "border-t-muted";
	const visibleProducts = productsExpanded ? products : products.slice(0, 3);
	const remainingCount = Math.max(0, productCount - 3);
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" && order.paymentProvider === "transfer";

	const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
		const target = e.target;
		if (target instanceof HTMLElement && target.closest("[data-no-nav]")) {
			return;
		}
		void navigate({
			params: { id: order.id.toString() },
			to: "/orders/$id",
		});
	};

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="max-w-[95vw] sm:max-w-[600px] lg:max-w-[640px]" data-no-nav>
					<DialogHeader>
						<DialogTitle>Захиалга засах</DialogTitle>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-3 sm:p-4">
						<OrderForm
							onSuccess={() => setIsEditDialogOpen(false)}
							order={{ ...order, isNewCustomer: false }}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<ShipOrderDialog
				address={order.address}
				addressZoneId={order.addressZoneId}
				onOpenChange={setIsShipDialogOpen}
				onSuccess={() => {
					void queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
				}}
				open={isShipDialogOpen}
				orderId={order.id}
				orderNumber={order.orderNumber}
			/>

			<Dialog onOpenChange={(open) => !open && setPreviewImage(null)} open={previewImage !== null}>
				<DialogContent
					className="border-border bg-card shadow-hard max-w-[95vw] border-2 p-3 sm:max-w-2xl"
					data-no-nav
				>
					<DialogHeader className="px-1">
						<DialogTitle className="line-clamp-2 text-base">
							{previewImage?.alt || "Бүтээгдэхүүний зураг"}
						</DialogTitle>
					</DialogHeader>
					<div className="border-border bg-muted max-h-[75vh] overflow-hidden border-2">
						{previewImage && (
							<img
								alt={previewImage.alt}
								className="h-full max-h-[75vh] w-full object-contain"
								src={previewImage.src}
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Card
				className={`group border-border bg-card shadow-hard-sm hover:shadow-hard cursor-pointer overflow-hidden border-2 transition-all duration-150 ${borderColor} border-t-4`}
				onClick={handleCardClick}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						handleCardClick(e);
					}
				}}
				tabIndex={0}
			>
				<CardContent className="flex flex-col gap-0 p-0">
					{/* Header */}
					<div className="p-4 pb-3">
						<div className="flex min-w-0 flex-1 items-start gap-3">
							{selection ? (
								<div
									className="pt-0.5"
									data-no-nav
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								>
									<Checkbox
										aria-label={`Сонгох #${order.orderNumber}`}
										checked={selection.checked}
										className="h-5 w-5"
										disabled={selection.disabled}
										onCheckedChange={(v) => selection.onCheckedChange(v === true)}
									/>
								</div>
							) : null}
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
									<span className="font-heading truncate text-lg font-black tracking-tight">
										#{order.orderNumber}
									</span>
									<span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
										{new Date(order.createdAt).toLocaleDateString("mn-MN", {
											day: "numeric",
											month: "short",
										})}
									</span>
								</div>
								<div className="mt-1.5 flex items-center gap-1.5">
									<Phone className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
									<span
										className="font-heading text-sm font-bold tabular-nums"
										data-no-nav
										onClick={(e) => {
											e.stopPropagation();
											window.location.href = `tel:${order.customerPhone}`;
										}}
									>
										{order.customerPhone}
									</span>
								</div>
							</div>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-1.5">
							<OrderStatusBadge status={order.status} />
							{order.paymentStatus && order.paymentProvider && (
								<span
									className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-bold whitespace-nowrap ${getPaymentStatusColor(order.paymentStatus)}`}
								>
									{getPaymentProviderIcon(order.paymentProvider)}
									{paymentStatusLabel[order.paymentStatus]}
								</span>
							)}
						</div>
					</div>

					{/* Address */}
					<div className="border-border flex items-center gap-2 border-t px-4 py-2.5">
						<MapPin className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
						<span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
							{order.address || "Хаяг оруулаагүй"}
						</span>
						<Button
							className="h-8 w-8 shrink-0"
							data-no-nav
							onClick={async (e) => {
								e.stopPropagation();
								await navigator.clipboard.writeText(order.address);
								toast("Хаяг хуулагдлаа");
							}}
							size="icon"
							variant="ghost"
						>
							<Copy className="h-3.5 w-3.5" />
						</Button>
					</div>

					{/* Products */}
					<div className="border-border space-y-2 border-t px-4 py-3" data-no-nav>
						<div className="flex items-center gap-2 overflow-x-auto pb-1">
							{visibleProducts.map((product, i) => {
								const src = product.imageUrl || "/placeholder.jpg";
								const showOverlay = !productsExpanded && i === 2 && remainingCount > 0;
								return (
									<button
										aria-label={
											showOverlay
												? `Бүх ${productCount} бүтээгдэхүүнийг харах`
												: `${product.name || "Бүтээгдэхүүн"} зургийг томоор харах`
										}
										className="border-border bg-muted relative h-12 w-12 shrink-0 overflow-hidden border-2 transition-transform active:translate-y-0.5"
										key={`${order.orderNumber}-${product.productId}-${i}`}
										onClick={(e) => {
											e.stopPropagation();
											if (showOverlay) {
												setProductsExpanded(true);
												return;
											}
											setPreviewImage({
												alt: product.name || "Бүтээгдэхүүн",
												src,
											});
										}}
										type="button"
									>
										<img
											alt={product.name || ""}
											className="h-full w-full object-cover"
											loading="lazy"
											src={src}
										/>
										{showOverlay && (
											<div className="font-heading absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-bold text-white">
												+{remainingCount}
											</div>
										)}
									</button>
								);
							})}
						</div>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Package className="text-muted-foreground h-4 w-4" />
								<span className="text-muted-foreground text-sm">{productCount} бараа</span>
							</div>
							<span className="font-heading text-lg font-black tabular-nums">
								₮{order.total.toLocaleString()}
							</span>
						</div>
					</div>

					{/* Actions */}
					<div className="border-border flex flex-col gap-3 border-t px-4 py-3" data-no-nav>
						{isPendingTransferClaim && order.paymentNumber ? (
							<TransferPaymentActions paymentNumber={order.paymentNumber} />
						) : null}
						<div className="flex items-center justify-between">
							{order.status === "pending" && (
								<Button
									className="h-10 gap-2 text-xs"
									onClick={(e) => {
										e.stopPropagation();
										setIsShipDialogOpen(true);
									}}
									size="sm"
									variant="default"
								>
									<Truck className="h-3.5 w-3.5" />
									Илгээх
								</Button>
							)}
							{order.status === "shipped" && (
								<Button
									className="h-10 gap-2 text-xs"
									disabled={updateOrderStatus.isPending}
									onClick={(e) => {
										e.stopPropagation();
										updateOrderStatus.mutate({
											id: order.id,
											status: "delivered",
										});
									}}
									size="sm"
									variant="default"
								>
									{updateOrderStatus.isPending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<CheckCircle className="h-3.5 w-3.5" />
									)}
									{updateOrderStatus.isPending ? "Шинэчилж байна..." : "Хүргэсэн"}
								</Button>
							)}
							{order.status !== "pending" && order.status !== "shipped" && <div />}
							<RowActions
								deleteMutation={() => deleteOrder.mutate({ id: order.id })}
								id={order.id}
								isDeletePending={deleteOrder.isPending}
								setIsEditDialogOpen={setIsEditDialogOpen}
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
