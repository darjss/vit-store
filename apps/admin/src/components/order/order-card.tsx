import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	CheckCircle,
	Copy,
	Loader2,
	MapPin,
	Package,
	Phone,
	Truck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import RowActions from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { paymentStatusLabel } from "@/lib/enum-labels";
import type { OrderType } from "@/lib/types";
import { getPaymentProviderIcon, getPaymentStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import OrderForm from "./order-form";
import { TransferPaymentActions } from "./pending-transfer-dialog";
import ShipOrderDialog from "./ship-order-dialog";

const statusBorderColor: Record<string, string> = {
	created: "border-t-[#64748b]",
	pending: "border-t-[#d97706]",
	shipped: "border-t-[#2563eb]",
	delivered: "border-t-[#059669]",
	cancelled: "border-t-[#dc2626]",
	refunded: "border-t-[#7c3aed]",
};

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
		src: string;
		alt: string;
	} | null>(null);
	const queryClient = useQueryClient();

	const updateOrderStatus = useMutation({
		...trpc.order.updateOrderStatus.mutationOptions(),
		onSuccess: () => {
			void queryClient.invalidateQueries(
				trpc.order.getPaginatedOrders.pathFilter(),
			);
			toast.success("Захиалгын төлөв амжилттай шинэчлэгдлээ");
		},
	});

	const deleteOrder = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onError: () => {
			toast.error("Захиалга устгахад алдаа гарлаа");
		},
		onSuccess: () => {
			toast.success("Захиалга амжилттай устгагдлаа");
		},
		onSettled: () => {
			void queryClient.invalidateQueries(
				trpc.order.getPaginatedOrders.pathFilter(),
			);
		},
	});

	const products = order.products ?? [];
	const productCount = products.length;
	const borderColor = statusBorderColor[order.status] ?? "border-t-muted";
	const visibleProducts = productsExpanded ? products : products.slice(0, 3);
	const remainingCount = Math.max(0, productCount - 3);
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" &&
		order.paymentProvider === "transfer";

	const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest("[data-no-nav]")) return;
		void navigate({
			to: "/orders/$id",
			params: { id: order.id.toString() },
		});
	};

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

			<ShipOrderDialog
				open={isShipDialogOpen}
				onOpenChange={setIsShipDialogOpen}
				orderId={order.id}
				orderNumber={order.orderNumber}
				address={order.address}
				addressZoneId={order.addressZoneId}
				onSuccess={() => {
					void queryClient.invalidateQueries(
						trpc.order.getPaginatedOrders.pathFilter(),
					);
				}}
			/>

			<Dialog
				open={previewImage !== null}
				onOpenChange={(open) => !open && setPreviewImage(null)}
			>
				<DialogContent
					data-no-nav
					className="max-w-[95vw] border-2 border-border bg-card p-3 shadow-hard sm:max-w-2xl"
				>
					<DialogHeader className="px-1">
						<DialogTitle className="line-clamp-2 text-base">
							{previewImage?.alt || "Бүтээгдэхүүний зураг"}
						</DialogTitle>
					</DialogHeader>
					<div className="max-h-[75vh] overflow-hidden border-2 border-border bg-muted">
						{previewImage && (
							<img
								src={previewImage.src}
								alt={previewImage.alt}
								className="h-full max-h-[75vh] w-full object-contain"
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Card
				className={`group cursor-pointer overflow-hidden border-2 border-border bg-card shadow-hard-sm transition-all duration-150 hover:shadow-hard ${borderColor} border-t-4`}
				onClick={handleCardClick}
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleCardClick(e);
				}}
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
										checked={selection.checked}
										disabled={selection.disabled}
										onCheckedChange={(v) =>
											selection.onCheckedChange(v === true)
										}
										aria-label={`Сонгох #${order.orderNumber}`}
										className="h-5 w-5"
									/>
								</div>
							) : null}
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
									<span className="truncate font-black font-heading text-lg tracking-tight">
										#{order.orderNumber}
									</span>
									<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs">
										{new Date(order.createdAt).toLocaleDateString("mn-MN", {
											month: "short",
											day: "numeric",
										})}
									</span>
								</div>
								<div className="mt-1.5 flex items-center gap-1.5">
									<Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span
										className="font-bold font-heading text-sm tabular-nums"
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
									className={`inline-flex items-center gap-1 whitespace-nowrap border px-2 py-1 font-bold text-[11px] ${getPaymentStatusColor(order.paymentStatus)}`}
								>
									{getPaymentProviderIcon(order.paymentProvider)}
									{paymentStatusLabel[order.paymentStatus]}
								</span>
							)}
						</div>
					</div>

					{/* Address */}
					<div className="flex items-center gap-2 border-border border-t px-4 py-2.5">
						<MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
							{order.address || "Хаяг оруулаагүй"}
						</span>
						<Button
							size="icon"
							variant="ghost"
							className="h-8 w-8 shrink-0"
							data-no-nav
							onClick={async (e) => {
								e.stopPropagation();
								await navigator.clipboard.writeText(order.address);
								toast("Хаяг хуулагдлаа");
							}}
						>
							<Copy className="h-3.5 w-3.5" />
						</Button>
					</div>

					{/* Products */}
					<div
						className="space-y-2 border-border border-t px-4 py-3"
						data-no-nav
					>
						<div className="flex items-center gap-2 overflow-x-auto pb-1">
							{visibleProducts.map((product, i) => {
								const src = product.imageUrl || "/placeholder.jpg";
								const showOverlay =
									!productsExpanded && i === 2 && remainingCount > 0;
								return (
									<button
										key={`${order.orderNumber}-${product.productId}-${i}`}
										type="button"
										className="relative h-12 w-12 shrink-0 overflow-hidden border-2 border-border bg-muted transition-transform active:translate-y-0.5"
										onClick={(e) => {
											e.stopPropagation();
											if (showOverlay) {
												setProductsExpanded(true);
												return;
											}
											setPreviewImage({
												src,
												alt: product.name || "Бүтээгдэхүүн",
											});
										}}
										aria-label={
											showOverlay
												? `Бүх ${productCount} бүтээгдэхүүнийг харах`
												: `${product.name || "Бүтээгдэхүүн"} зургийг томоор харах`
										}
									>
										<img
											src={src}
											alt={product.name || ""}
											className="h-full w-full object-cover"
											loading="lazy"
										/>
										{showOverlay && (
											<div className="absolute inset-0 flex items-center justify-center bg-black/60 font-bold font-heading text-white text-xs">
												+{remainingCount}
											</div>
										)}
									</button>
								);
							})}
						</div>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Package className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground text-sm">
									{productCount} бараа
								</span>
							</div>
							<span className="font-black font-heading text-lg tabular-nums">
								₮{order.total.toLocaleString()}
							</span>
						</div>
					</div>

					{/* Actions */}
					<div
						className="flex flex-col gap-3 border-border border-t px-4 py-3"
						data-no-nav
					>
						{isPendingTransferClaim && order.paymentNumber ? (
							<TransferPaymentActions paymentNumber={order.paymentNumber} />
						) : null}
						<div className="flex items-center justify-between">
							{order.status === "pending" && (
								<Button
									variant="default"
									size="sm"
									className="h-10 gap-2 text-xs"
									onClick={(e) => {
										e.stopPropagation();
										setIsShipDialogOpen(true);
									}}
								>
									<Truck className="h-3.5 w-3.5" />
									Илгээх
								</Button>
							)}
							{order.status === "shipped" && (
								<Button
									variant="default"
									size="sm"
									className="h-10 gap-2 text-xs"
									disabled={updateOrderStatus.isPending}
									onClick={(e) => {
										e.stopPropagation();
										updateOrderStatus.mutate({
											id: order.id,
											status: "delivered",
										});
									}}
								>
									{updateOrderStatus.isPending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<CheckCircle className="h-3.5 w-3.5" />
									)}
									{updateOrderStatus.isPending
										? "Шинэчилж байна..."
										: "Хүргэсэн"}
								</Button>
							)}
							{order.status !== "pending" && order.status !== "shipped" && (
								<div />
							)}
							<RowActions
								id={order.id}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={() => deleteOrder.mutate({ id: order.id })}
								isDeletePending={deleteOrder.isPending}
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
