import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle, Copy, Loader2, MapPin, Phone, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { instance, is } from "valibot";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import RowActions from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { paymentStatusLabel } from "@/lib/enum-labels";
import type { OrderType } from "@/lib/types";
import { trpc } from "@/utils/trpc";
import OrderForm from "./order-form";
import { TransferPaymentActions } from "./pending-transfer-dialog";
import ShipOrderDialog from "./ship-order-dialog";

interface OrderCardProps {
	order: OrderType;
	selection?: {
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
	};
}

// ponytail: legacy admin order card — split actions later; complexity ceiling 20
// oxlint-disable-next-line complexity
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
	const visibleProducts = productsExpanded ? products : products.slice(0, 4);
	// Four slots; with five or more products the fourth becomes a "+N" tile.
	const remainingCount = productCount > 4 ? productCount - 3 : 0;
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" && order.paymentProvider === "transfer";

	const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
		if (is(instance(Element), e.target) && e.target.closest("[data-no-nav]")) {
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
					className="border-border bg-card max-w-[95vw] border p-3 sm:max-w-2xl"
					data-no-nav
				>
					<DialogHeader className="px-1">
						<DialogTitle className="line-clamp-2 text-base">
							{previewImage?.alt || "Бүтээгдэхүүний зураг"}
						</DialogTitle>
					</DialogHeader>
					<div className="border-border bg-muted max-h-[75vh] overflow-hidden border">
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

			<div
				className="group bg-card cursor-pointer border transition-colors hover:border-[oklch(0.7_0_0)]"
				onClick={handleCardClick}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						handleCardClick(e);
					}
				}}
				tabIndex={0}
			>
				<div className="flex gap-3 px-3 pt-3">
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
						<div className="flex items-center gap-2">
							<span className="text-base font-semibold">{order.orderNumber}</span>
							<span className="text-muted-foreground text-xs whitespace-nowrap">
								{new Date(order.createdAt).toLocaleString("en-GB", {
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
									month: "short",
									timeZone: "Asia/Ulaanbaatar",
								})}
							</span>
							<span className="ml-auto">
								<OrderStatusBadge status={order.status} />
							</span>
						</div>
						<div className="mt-1.5 flex items-center gap-1.5 text-sm">
							<Phone className="text-muted-foreground size-3.5 shrink-0" />
							<a
								className="font-medium tabular-nums underline-offset-2 hover:underline"
								data-no-nav
								href={`tel:${order.customerPhone}`}
								onClick={(e) => e.stopPropagation()}
							>
								{order.customerPhone}
							</a>
						</div>
						<div className="mt-0.5 flex items-center gap-1.5 text-sm">
							<MapPin className="text-muted-foreground size-3.5 shrink-0" />
							<span className="text-muted-foreground min-w-0 flex-1 truncate">
								{order.address || "Хаяг оруулаагүй"}
							</span>
							<button
								aria-label="Хаяг хуулах"
								className="text-muted-foreground hover:text-foreground -my-1.5 flex size-8 shrink-0 items-center justify-center"
								data-no-nav
								onClick={async (e) => {
									e.stopPropagation();
									await navigator.clipboard.writeText(order.address);
									toast("Хаяг хуулагдлаа");
								}}
								type="button"
							>
								<Copy className="size-3.5" />
							</button>
						</div>
					</div>
				</div>

				<div className="flex gap-2 px-3 py-3" data-no-nav>
					{visibleProducts.map((product, i) => {
						const src = product.imageUrl || "/placeholder.jpg";
						const showOverlay = !productsExpanded && i === 3 && remainingCount > 0;
						return (
							<button
								aria-label={
									showOverlay
										? `Бүх ${productCount} бүтээгдэхүүнийг харах`
										: `${product.name || "Бүтээгдэхүүн"} зургийг томоор харах`
								}
								className="relative size-[4.5rem] shrink-0 overflow-hidden border bg-white p-1"
								key={`${order.orderNumber}-${product.productId}-${i}`}
								onClick={(e) => {
									e.stopPropagation();
									if (showOverlay) {
										setProductsExpanded(true);
										return;
									}
									setPreviewImage({ alt: product.name || "Бүтээгдэхүүн", src });
								}}
								type="button"
							>
								<img
									alt={product.name || ""}
									className="h-full w-full object-contain"
									loading="lazy"
									src={src}
								/>
								{product.quantity > 1 && !showOverlay && (
									<span className="bg-foreground absolute right-0 bottom-0 px-1 text-[11px] font-semibold text-white tabular-nums">
										×{product.quantity}
									</span>
								)}
								{showOverlay && (
									<div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-white">
										+{remainingCount}
									</div>
								)}
							</button>
						);
					})}
				</div>

				{isPendingTransferClaim && order.paymentNumber ? (
					<div className="mx-3 mb-3 border border-amber-300 bg-amber-50 p-2" data-no-nav>
						<p className="mb-2 text-sm font-medium">Шилжүүлсэн гэж байна. Банкаа шалгаад:</p>
						<TransferPaymentActions paymentNumber={order.paymentNumber} />
					</div>
				) : null}

				<div className="flex items-center gap-2 border-t px-3 py-2" data-no-nav>
					<div className="min-w-0">
						<p className="text-base leading-tight font-bold tabular-nums">
							₮{order.total.toLocaleString()}
						</p>
						<p className="text-muted-foreground truncate text-xs">
							{productCount} бараа
							{/* Paid is the normal case, so only unpaid or disputed payments are named. */}
							{order.paymentStatus && order.paymentStatus !== "success" && !isPendingTransferClaim
								? ` · ${paymentStatusLabel[order.paymentStatus]}`
								: null}
						</p>
					</div>
					<div className="ml-auto flex items-center gap-1">
						{order.status === "pending" && (
							<Button
								className="h-10 gap-1.5 px-4 text-sm"
								onClick={(e) => {
									e.stopPropagation();
									setIsShipDialogOpen(true);
								}}
								size="sm"
							>
								<Truck className="size-4" />
								Илгээх
							</Button>
						)}
						{order.status === "shipped" && (
							<Button
								className="h-10 gap-1.5 px-4 text-sm"
								disabled={updateOrderStatus.isPending}
								onClick={(e) => {
									e.stopPropagation();
									updateOrderStatus.mutate({ id: order.id, status: "delivered" });
								}}
								size="sm"
							>
								{updateOrderStatus.isPending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<CheckCircle className="size-4" />
								)}
								Хүргэсэн
							</Button>
						)}
						<RowActions
							compact
							deleteMutation={() => deleteOrder.mutate({ id: order.id })}
							id={order.id}
							isDeletePending={deleteOrder.isPending}
							setIsEditDialogOpen={setIsEditDialogOpen}
						/>
					</div>
				</div>
			</div>
		</>
	);
}
