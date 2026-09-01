import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { PaymentStatusType } from "@vit/shared/types";
import {
	AlertTriangle,
	ArrowLeft,
	CalendarClock,
	CheckCircle,
	Copy,
	MapPin,
	Package,
	Phone,
	Receipt,
	Truck,
	User,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/dashboard/order-status-badge";
import { EditableField } from "@/components/editable-field";
import OrderForm from "@/components/order/order-form";
import { TransferPaymentActions } from "@/components/order/pending-transfer-dialog";
import ShipOrderDialog from "@/components/order/ship-order-dialog";
import RowAction from "@/components/row-actions";
import { FormPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { orderStatusLabel, paymentProviderLabel, paymentStatusLabel } from "@/lib/enum-labels";
import { formatCurrency, getPaymentProviderIcon, getPaymentStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/$id")({
	component: RouteComponent,
	loader: ({ context: ctx, params }) => {
		// Order numbers are always 8 chars (generateOrderNumber → nanoId(8)).
		// Numeric ids are auto-increment integers. An 8-char param — even all
		// digits — is treated as an order number; only non-8-char numeric params
		// go to getOrderById.
		if (params.id.length === 8) {
			void ctx.queryClient.prefetchQuery(
				ctx.trpc.order.getOrderIdByOrderNumber.queryOptions({
					orderNumber: params.id,
				}),
			);
		} else {
			void ctx.queryClient.prefetchQuery(
				ctx.trpc.order.getOrderById.queryOptions({ id: Number(params.id) }),
			);
		}
	},
	pendingComponent: FormPageSkeleton,
});

function RouteComponent() {
	return (
		<Suspense fallback={<FormPageSkeleton />}>
			<OrderDetailContent />
		</Suspense>
	);
}

function deliveryLabel(provider?: string | null) {
	switch (provider) {
		case "tu-delivery":
			return "TU delivery";
		case "self":
			return "Өөрсдөө хүргэнэ";
		case "avidaa":
			return "Avidaa";
		case "pick-up":
			return "Өөрөө авна";
		default:
			return "Тодорхойгүй";
	}
}

function OrderDetailContent() {
	const { id } = Route.useParams();

	// 8-char param → order number lookup; else numeric id.
	if (id.length === 8) {
		return <ResolveOrderNumber orderNumber={id} />;
	}
	return <OrderDetail orderId={Number(id)} />;
}

function ResolveOrderNumber({ orderNumber }: { orderNumber: string }) {
	const navigate = useNavigate();
	const { data: resolvedId } = useSuspenseQuery({
		...trpc.order.getOrderIdByOrderNumber.queryOptions({ orderNumber }),
	});

	if (resolvedId == null) {
		return (
			<div className="mx-auto max-w-3xl p-4">
				<div className="border-border bg-card shadow-hard border-2 p-6">
					<h1 className="font-heading text-xl font-black">Захиалга олдсонгүй</h1>
					<Button className="mt-4" onClick={() => navigate({ to: "/orders" })}>
						Буцах
					</Button>
				</div>
			</div>
		);
	}

	return <OrderDetail orderId={resolvedId} />;
}

function OrderDetail({ orderId }: { orderId: number }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);

	const { data: order } = useSuspenseQuery({
		...trpc.order.getOrderById.queryOptions({ id: orderId }),
	});
	const addressZonesQuery = useQuery({
		...trpc.order.getDeliveryAddressZones.queryOptions(),
		enabled: order?.addressZoneId !== undefined,
		staleTime: 1000 * 60 * 60 * 24,
	});

	if (!order) {
		return (
			<div className="mx-auto max-w-3xl p-4">
				<div className="border-border bg-card shadow-hard border-2 p-6">
					<h1 className="font-heading text-xl font-black">Захиалга олдсонгүй</h1>
					<Button className="mt-4" onClick={() => navigate({ to: "/orders" })}>
						Буцах
					</Button>
				</div>
			</div>
		);
	}

	const invalidateOrder = () =>
		queryClient.invalidateQueries(trpc.order.getOrderById.queryOptions({ id: orderId }));
	const invalidateOrderLists = () =>
		queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());

	const { isPending: isDeletePending, mutate: deleteOrder } = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
			navigate({ to: "/orders" });
			toast.success("Захиалга устгагдлаа");
		},
	});

	const { isPending: isUpdateStatusPending, mutate: updateOrderStatus } = useMutation({
		...trpc.order.updateOrderStatus.mutationOptions(),
		onSuccess: () => {
			invalidateOrder();
			queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
			toast.success("Төлөв шинэчлэгдлээ");
		},
	});

	const { isPending: isUpdateFieldPending, mutate: updateOrderField } = useMutation({
		...trpc.order.updateOrder.mutationOptions(),
		onSuccess: () => {
			invalidateOrder();
			void invalidateOrderLists();
			toast.success("Мэдээлэл хадгалагдлаа");
		},
	});

	const { isPending: isPatchHeaderPending, mutate: patchOrderHeader } = useMutation({
		...trpc.order.patchOrderHeader.mutationOptions(),
		onSuccess: () => {
			invalidateOrder();
			void invalidateOrderLists();
			toast.success("Мэдээлэл хадгалагдлаа");
		},
	});

	// Header-only inline edits (notes, address, phone, deliveryProvider, status)
	// go through the lightweight patchOrderHeader endpoint, which touches only
	// order header columns and does NOT rewrite order details / sales / stock.
	// Payment-status edits still go through updateOrder because they can trigger
	// stock + sales transitions.
	const savePatch = (patch: Partial<typeof order>) => {
		if (patch.paymentStatus !== undefined) {
			updateOrderField({
				address: order.address,
				addressZoneId: order.addressZoneId,
				customerPhone: String(order.customerPhone),
				deliveryProvider: order.deliveryProvider,
				id: orderId,
				isNewCustomer: false,
				notes: order.notes,
				paymentStatus: patch.paymentStatus,
				products: order.products || [],
				status: order.status,
			});
			return;
		}
		patchOrderHeader({
			address: patch.address,
			customerPhone: patch.customerPhone !== undefined ? String(patch.customerPhone) : undefined,
			deliveryProvider: patch.deliveryProvider,
			id: orderId,
			notes: patch.notes,
		});
	};

	const copy = async (text: string, label: string) => {
		await navigator.clipboard.writeText(text);
		toast.success(`${label} хуулагдлаа`);
	};

	const nextAction =
		order.status === "pending"
			? {
					icon: Truck,
					label: "TU руу илгээх",
					onClick: () => setIsShipDialogOpen(true),
					pending: false,
				}
			: order.status === "shipped"
				? {
						icon: CheckCircle,
						label: "Хүргэсэн болгох",
						onClick: () => updateOrderStatus({ id: orderId, status: "delivered" }),
						pending: isUpdateStatusPending,
					}
				: null;

	const itemCount = order.products?.reduce((sum, p) => sum + p.quantity, 0) ?? 0;
	const isPaid = order.paymentStatus === "success";
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" &&
		order.paymentProvider === "transfer" &&
		Boolean(order.paymentNumber);
	const created = new Date(order.createdAt).toLocaleString("mn-MN");
	const updated = order.updatedAt ? new Date(order.updatedAt).toLocaleString("mn-MN") : null;

	return (
		<>
			<ShipOrderDialog
				address={order.address}
				addressZoneId={order.addressZoneId}
				onOpenChange={setIsShipDialogOpen}
				onSuccess={() => {
					void invalidateOrder();
					void invalidateOrderLists();
				}}
				open={isShipDialogOpen}
				orderId={orderId}
				orderNumber={order.orderNumber}
			/>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-border border-b-2 px-6 pt-6 pb-4">
						<DialogTitle>Захиалга засах</DialogTitle>
						<DialogDescription>#{order.orderNumber}</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-3 sm:p-6">
						<OrderForm
							onSuccess={() => {
								setIsEditDialogOpen(false);
								invalidateOrder();
							}}
							order={{
								...order,
								customerPhone: order.customerPhone.toString(),
								isNewCustomer: false,
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<div className="mx-auto max-w-7xl space-y-4 px-3 py-4 pb-24 sm:px-4 sm:py-6 lg:px-6">
				<header className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<Button
							aria-label="Захиалгууд руу буцах"
							className="h-11 w-11 shrink-0"
							onClick={() => navigate({ to: "/orders" })}
							size="icon"
							variant="outline"
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div className="min-w-0">
							<h1 className="font-heading truncate text-2xl font-black tracking-tight sm:text-3xl">
								#{order.orderNumber}
							</h1>
							<p className="text-muted-foreground text-xs sm:text-sm">{created}</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<OrderStatusBadge status={order.status} />
						<RowAction
							deleteMutation={(id) => deleteOrder({ id })}
							id={orderId}
							isDeletePending={isDeletePending}
							setIsEditDialogOpen={setIsEditDialogOpen}
						/>
					</div>
				</header>

				<section className="border-border bg-card shadow-hard border-2 p-4 sm:p-5">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<span
									className={`inline-flex items-center gap-1 border-2 px-2 py-1 text-xs font-bold ${getPaymentStatusColor(order.paymentStatus)}`}
								>
									{getPaymentProviderIcon(order.paymentProvider)}{" "}
									{paymentStatusLabel[order.paymentStatus]}
								</span>
								<span className="border-border bg-muted border-2 px-2 py-1 text-xs font-bold">
									{deliveryLabel(order.deliveryProvider)}
								</span>
								{!isPaid && (
									<span className="border-destructive bg-error inline-flex items-center gap-1 border-2 px-2 py-1 text-xs font-bold">
										<AlertTriangle className="h-3.5 w-3.5" /> Төлбөр шалгах
									</span>
								)}
							</div>
							<p className="text-muted-foreground max-w-2xl text-sm">
								Энэ дэлгэцийн гол ажил: хэрэглэгчтэй холбогдох, хаяг шалгах, барааг баталгаажуулах,
								хүргэлт рүү шилжүүлэх.
							</p>
						</div>
						{nextAction && (
							<Button
								className="h-12 gap-2 px-5"
								disabled={nextAction.pending}
								onClick={nextAction.onClick}
							>
								<nextAction.icon className="h-4 w-4" />
								{nextAction.pending ? "Ажиллаж байна..." : nextAction.label}
							</Button>
						)}
					</div>
				</section>

				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
					<main className="space-y-4">
						<section className="border-border bg-card shadow-hard-sm border-2 p-4 sm:p-5">
							<div className="mb-4 flex items-center justify-between gap-3">
								<h2 className="font-heading flex items-center gap-2 text-lg font-black">
									<User className="h-5 w-5" /> Харилцагч
								</h2>
								<Button
									className="h-10 gap-2"
									onClick={() => (window.location.href = `tel:${order.customerPhone}`)}
									size="sm"
									variant="outline"
								>
									<Phone className="h-4 w-4" /> Залгах
								</Button>
							</div>

							<div className="space-y-4">
								<InfoRow label="Утас" onCopy={() => copy(order.customerPhone.toString(), "Утас")}>
									<EditableField
										isLoading={isPatchHeaderPending}
										onSave={(next) => savePatch({ customerPhone: next })}
										value={order.customerPhone.toString()}
									/>
								</InfoRow>

								<InfoRow label="Хаяг" onCopy={() => copy(order.address || "", "Хаяг")}>
									<EditableField
										isLoading={isPatchHeaderPending}
										onSave={(next) => savePatch({ address: next })}
										type="textarea"
										value={order.address || ""}
									/>
								</InfoRow>

								<InfoRow label="Тэмдэглэл">
									<EditableField
										isLoading={isPatchHeaderPending}
										onSave={(next) => savePatch({ notes: next })}
										renderDisplay={(value) =>
											value || <span className="text-muted-foreground">Тэмдэглэлгүй</span>
										}
										type="textarea"
										value={order.notes || ""}
									/>
								</InfoRow>
							</div>
						</section>

						<section className="border-border bg-card shadow-hard-sm border-2 p-4 sm:p-5">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="font-heading flex items-center gap-2 text-lg font-black">
									<Package className="h-5 w-5" /> Бүтээгдэхүүн
								</h2>
								<span className="border-border bg-muted border-2 px-2 py-1 text-xs font-bold">
									{order.products?.length ?? 0} төрөл, {itemCount} ширхэг
								</span>
							</div>

							<div className="space-y-3">
								{order.products?.map((product, index) => (
									<div
										className="border-border bg-background grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-2 p-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_7rem] sm:items-center sm:p-3"
										key={`${product.productId}-${index}`}
									>
										<div className="border-border bg-muted h-16 w-16 overflow-hidden border-2 sm:h-18 sm:w-18">
											<img
												alt={product.name}
												className="h-full w-full object-cover"
												loading="lazy"
												src={product.imageUrl || "/placeholder.jpg"}
											/>
										</div>
										<div className="min-w-0">
											<h3 className="font-heading line-clamp-2 text-sm font-bold sm:text-base">
												{product.name}
											</h3>
											<p className="text-muted-foreground mt-1 text-xs">
												{product.quantity} × {formatCurrency(product.price)}
											</p>
										</div>
										<div className="border-border col-span-2 flex items-center justify-between border-t pt-2 sm:col-span-1 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
											<span className="text-muted-foreground text-xs sm:hidden">Дүн</span>
											<p className="font-heading font-black tabular-nums">
												{formatCurrency(product.price * product.quantity)}
											</p>
										</div>
									</div>
								))}
							</div>
						</section>
					</main>

					<aside className="space-y-4">
						<section className="border-border bg-card shadow-hard-sm border-2 p-4 sm:p-5">
							<h2 className="font-heading mb-4 flex items-center gap-2 text-lg font-black">
								<Receipt className="h-5 w-5" /> Төлбөр ба дүн
							</h2>
							<div className="space-y-4">
								<EditableField
									isLoading={isUpdateFieldPending}
									label="Төлөв"
									onSave={(next) =>
										savePatch({
											paymentStatus: next as typeof order.paymentStatus,
										})
									}
									options={[
										{ label: "Хүлээгдэж буй", value: "pending" },
										{
											label: "Төлсөн гэж мэдэгдсэн",
											value: "customer_claimed_paid",
										},
										{ label: "Төлсөн", value: "success" },
										{ label: "Амжилтгүй", value: "failed" },
									]}
									renderDisplay={(value) => (
										<span
											className={`inline-flex border-2 px-2 py-1 text-xs ${getPaymentStatusColor(value)}`}
										>
											{paymentStatusLabel[value as PaymentStatusType]}
										</span>
									)}
									type="select"
									value={order.paymentStatus}
								/>
								{isPendingTransferClaim && order.paymentNumber ? (
									<div className="border-primary/30 bg-primary/5 space-y-2 border-2 p-3">
										<p className="text-sm font-bold">Хэрэглэгч шилжүүлэг хийсэн гэж мэдэгдлээ</p>
										<p className="text-muted-foreground text-xs">
											Дансны орлого шалгаад доорх товчоор баталгаажуулна уу
										</p>
										<TransferPaymentActions
											onSuccess={() => {
												void invalidateOrder();
											}}
											paymentNumber={order.paymentNumber}
										/>
									</div>
								) : null}
								<div className="border-border flex items-center justify-between border-t pt-3 text-sm">
									<span className="text-muted-foreground">Хэрэгсэл</span>
									<span className="font-bold">
										{getPaymentProviderIcon(order.paymentProvider)}{" "}
										{order.paymentProvider
											? paymentProviderLabel[order.paymentProvider]
											: "Тодорхойгүй"}
									</span>
								</div>
								<div className="border-border flex items-center justify-between border-t pt-3 text-sm">
									<span className="text-muted-foreground">Нийт ширхэг</span>
									<span className="font-bold">{itemCount}</span>
								</div>
								<div className="border-border flex items-end justify-between border-t-2 pt-4">
									<span className="font-heading font-black">Нийт</span>
									<span className="font-heading text-2xl font-black tabular-nums">
										{formatCurrency(order.total)}
									</span>
								</div>
							</div>
						</section>

						<section className="border-border bg-card shadow-hard-sm border-2 p-4 sm:p-5">
							<h2 className="font-heading mb-4 flex items-center gap-2 text-lg font-black">
								<Truck className="h-5 w-5" /> Хүргэлт
							</h2>
							<EditableField
								isLoading={isPatchHeaderPending}
								label="Арга"
								onSave={(next) =>
									savePatch({
										deliveryProvider: next as typeof order.deliveryProvider,
									})
								}
								options={[
									{ label: "TU delivery", value: "tu-delivery" },
									{ label: "Өөрсдөө хүргэнэ", value: "self" },
									{ label: "Avidaa", value: "avidaa" },
									{ label: "Өөрөө авна", value: "pick-up" },
								]}
								renderDisplay={(value) => deliveryLabel(value)}
								type="select"
								value={order.deliveryProvider || "tu-delivery"}
							/>
							{order.addressZoneId !== undefined ? (
								<div className="border-border mt-4 border-t pt-3 text-sm">
									<span className="text-muted-foreground">Хүргэлтийн бүс</span>
									<p className="mt-1 font-bold">
										{addressZonesQuery.data?.find((zone) => zone.id === order.addressZoneId)
											?.zoneName ?? `Бүс #${order.addressZoneId}`}
									</p>
								</div>
							) : null}
							<Button
								className="mt-4 h-11 w-full gap-2"
								onClick={() => copy(order.address || "", "Хүргэлтийн хаяг")}
								variant="outline"
							>
								<MapPin className="h-4 w-4" /> Хаяг хуулах
							</Button>
						</section>

						<section className="border-border bg-card shadow-hard-sm border-2 p-4 sm:p-5">
							<h2 className="font-heading mb-4 flex items-center gap-2 text-lg font-black">
								<CalendarClock className="h-5 w-5" /> Түүх
							</h2>
							<div className="space-y-3 text-sm">
								<TimelineRow active label="Захиалга үүссэн" value={created} />
								{updated && (
									<TimelineRow
										active={order.status !== "pending"}
										label="Сүүлд шинэчлэгдсэн"
										value={updated}
									/>
								)}
								<TimelineRow
									active={isPaid}
									label={`Одоогийн төлөв: ${orderStatusLabel[order.status]}`}
									value={paymentStatusLabel[order.paymentStatus]}
								/>
							</div>
						</section>
					</aside>
				</div>
			</div>

			{nextAction && (
				<div className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:hidden">
					<Button
						className="h-12 w-full gap-2"
						disabled={nextAction.pending}
						onClick={nextAction.onClick}
					>
						<nextAction.icon className="h-4 w-4" />
						{nextAction.pending ? "Ажиллаж байна..." : nextAction.label}
					</Button>
				</div>
			)}
		</>
	);
}

function InfoRow({
	children,
	label,
	onCopy,
}: {
	children: React.ReactNode;
	label: string;
	onCopy?: () => void;
}) {
	return (
		<div className="border-border border-t pt-3 first:border-t-0 first:pt-0">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<p className="font-heading text-muted-foreground text-xs font-bold tracking-wide uppercase">
					{label}
				</p>
				{onCopy && (
					<Button className="h-8 w-8" onClick={onCopy} size="icon" variant="ghost">
						<Copy className="h-3.5 w-3.5" />
					</Button>
				)}
			</div>
			{children}
		</div>
	);
}

function TimelineRow({ active, label, value }: { active?: boolean; label: string; value: string }) {
	return (
		<div className="flex gap-3">
			<div
				className={`border-border mt-1.5 h-3 w-3 shrink-0 border-2 ${active ? "bg-primary" : "bg-muted"}`}
			/>
			<div>
				<p className="leading-tight font-bold">{label}</p>
				<p className="text-muted-foreground text-xs">{value}</p>
			</div>
		</div>
	);
}
