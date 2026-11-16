import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { deliveryProvider, paymentStatus } from "@vit/shared/constants";
import type { OrderDeliveryProviderType, PaymentStatusType } from "@vit/shared/types";
import { CheckCircle, Copy, Phone, Truck } from "lucide-react";
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
import { paymentProviderLabel, paymentStatusLabel } from "@/lib/enum-labels";
import { parsePicklistValue } from "@/lib/parse-select";
import { cn, formatCurrency } from "@/lib/utils";
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
				<div className="border-border bg-card border p-6">
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

async function copyOrderField(text: string, label: string) {
	await navigator.clipboard.writeText(text);
	toast.success(`${label} хуулагдлаа`);
}

// ponytail: legacy admin order detail page — split sections later; complexity ceiling 29
// oxlint-disable-next-line complexity
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

	if (!order) {
		return (
			<div className="mx-auto max-w-3xl p-4">
				<div className="border-border bg-card border p-6">
					<h1 className="font-heading text-xl font-black">Захиалга олдсонгүй</h1>
					<Button className="mt-4" onClick={() => navigate({ to: "/orders" })}>
						Буцах
					</Button>
				</div>
			</div>
		);
	}

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
	const paymentStatusValue: PaymentStatusType = order.paymentStatus;
	const deliveryProviderValue: OrderDeliveryProviderType = order.deliveryProvider ?? "tu-delivery";
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" &&
		order.paymentProvider === "transfer" &&
		Boolean(order.paymentNumber);
	const zoneName =
		order.addressZoneId === undefined
			? undefined
			: (addressZonesQuery.data?.find((zone) => zone.id === order.addressZoneId)?.zoneName ??
				`Бүс #${order.addressZoneId}`);

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
					<DialogHeader className="border-b px-6 pt-6 pb-4">
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

			<div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4">
				<div className="space-y-3 lg:space-y-4">
					<section className="border bg-white">
						<div className="flex items-start gap-2 px-4 pt-3">
							<div className="min-w-0 flex-1">
								<h1 className="text-xl font-bold tracking-tight">#{order.orderNumber}</h1>
								<p className="text-muted-foreground text-xs">{formatWhen(order.createdAt)}</p>
							</div>
							<OrderStatusBadge status={order.status} />
							<RowAction
								compact
								deleteMutation={(id) => deleteOrder({ id })}
								id={orderId}
								isDeletePending={isDeletePending}
								setIsEditDialogOpen={setIsEditDialogOpen}
							/>
						</div>
						<div className="flex items-end justify-between gap-3 px-4 pt-3 pb-3">
							<p className="text-3xl leading-none font-bold tabular-nums">
								{formatCurrency(order.total)}
							</p>
							<p className="text-muted-foreground text-right text-sm">
								{itemCount} бараа · {deliveryLabel(order.deliveryProvider)}
							</p>
						</div>
						<div className="flex items-center gap-2 border-t px-4 py-2.5 text-sm">
							<span
								className={cn("size-2 shrink-0 rounded-full", paymentDot(order.paymentStatus))}
							/>
							<span className="font-medium">{paymentStatusLabel[order.paymentStatus]}</span>
							<span className="text-muted-foreground">
								·{" "}
								{order.paymentProvider
									? paymentProviderLabel[order.paymentProvider]
									: "Төлбөрийн хэрэгсэл тодорхойгүй"}
							</span>
						</div>
						{isPendingTransferClaim && order.paymentNumber ? (
							<div className="space-y-2 border-t bg-[oklch(0.97_0.06_95)] px-4 py-3">
								<p className="text-sm font-medium">Хэрэглэгч шилжүүлэг хийсэн гэж мэдэгдлээ</p>
								<TransferPaymentActions
									onSuccess={() => {
										void invalidateOrder();
									}}
									paymentNumber={order.paymentNumber}
								/>
							</div>
						) : null}
						{nextAction && (
							<div className="border-t p-3">
								<Button
									className="h-12 w-full gap-2 text-base"
									disabled={nextAction.pending}
									onClick={nextAction.onClick}
								>
									<nextAction.icon className="size-5" />
									{nextAction.pending ? "Ажиллаж байна..." : nextAction.label}
								</Button>
							</div>
						)}
					</section>

					<section className="border bg-white">
						<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
							Бараа · {order.products?.length ?? 0} төрөл, {itemCount} ширхэг
						</h2>
						<ul className="divide-y">
							{order.products?.map((product, index) => (
								<li key={`${product.productId}-${index}`}>
									<Link
										className="active:bg-muted hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5"
										params={{ id: String(product.productId) }}
										to="/products/$id"
									>
										<img
											alt=""
											className="size-16 shrink-0 border bg-white object-contain p-1"
											loading="lazy"
											src={product.imageUrl || "/placeholder.jpg"}
										/>
										<div className="min-w-0 flex-1">
											<p className="line-clamp-2 text-sm leading-snug">{product.name}</p>
											<p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
												{product.quantity} × {formatCurrency(product.price)}
											</p>
										</div>
										<p className="text-sm font-semibold tabular-nums">
											{formatCurrency(product.price * product.quantity)}
										</p>
									</Link>
								</li>
							))}
						</ul>
						<div className="flex items-center justify-between border-t px-4 py-2.5">
							<span className="text-muted-foreground text-sm">Нийт</span>
							<span className="text-base font-bold tabular-nums">
								{formatCurrency(order.total)}
							</span>
						</div>
					</section>
				</div>

				<div className="space-y-3 lg:space-y-4">
					<section className="border bg-white">
						<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
							Хэрэглэгч
						</h2>
						<div className="divide-y">
							<EditableField
								actions={
									<>
										<IconAction href={`tel:${order.customerPhone}`} label="Залгах">
											<Phone className="size-4" />
										</IconAction>
										<IconAction
											label="Утас хуулах"
											onClick={() => copyOrderField(order.customerPhone.toString(), "Утас")}
										>
											<Copy className="size-4" />
										</IconAction>
									</>
								}
								isLoading={isPatchHeaderPending}
								label="Утас"
								onSave={(next) => savePatch({ customerPhone: next })}
								renderDisplay={(value) => <span className="tabular-nums">{value}</span>}
								value={order.customerPhone.toString()}
							/>
							<EditableField
								actions={
									<IconAction
										label="Хаяг хуулах"
										onClick={() => copyOrderField(order.address || "", "Хаяг")}
									>
										<Copy className="size-4" />
									</IconAction>
								}
								isLoading={isPatchHeaderPending}
								label={zoneName ? `Хаяг · ${zoneName}` : "Хаяг"}
								onSave={(next) => savePatch({ address: next })}
								type="textarea"
								value={order.address || ""}
							/>
							<EditableField
								isLoading={isPatchHeaderPending}
								label="Тэмдэглэл"
								onSave={(next) => savePatch({ notes: next })}
								renderDisplay={(value) =>
									value || <span className="text-muted-foreground">Тэмдэглэлгүй</span>
								}
								type="textarea"
								value={order.notes || ""}
							/>
						</div>
					</section>

					<section className="border bg-white">
						<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
							Төлбөр ба хүргэлт
						</h2>
						<div className="divide-y">
							<EditableField<PaymentStatusType>
								isLoading={isUpdateFieldPending}
								label="Төлбөр"
								onSave={(next) => savePatch({ paymentStatus: next })}
								options={[
									{ label: "Хүлээгдэж буй", value: "pending" },
									{ label: "Төлсөн гэж мэдэгдсэн", value: "customer_claimed_paid" },
									{ label: "Төлсөн", value: "success" },
									{ label: "Амжилтгүй", value: "failed" },
								]}
								parse={(raw): PaymentStatusType =>
									parsePicklistValue(paymentStatus, raw) ?? paymentStatusValue
								}
								renderDisplay={(value) => (
									<span className="flex items-center gap-2">
										<span className={cn("size-2 rounded-full", paymentDot(value))} />
										{paymentStatusLabel[value]}
									</span>
								)}
								type="select"
								value={paymentStatusValue}
							/>
							<EditableField<OrderDeliveryProviderType>
								isLoading={isPatchHeaderPending}
								label="Хүргэлт"
								onSave={(next) => savePatch({ deliveryProvider: next })}
								options={[
									{ label: "TU delivery", value: "tu-delivery" },
									{ label: "Өөрсдөө хүргэнэ", value: "self" },
									{ label: "Avidaa", value: "avidaa" },
									{ label: "Өөрөө авна", value: "pick-up" },
								]}
								parse={(raw): OrderDeliveryProviderType =>
									parsePicklistValue(deliveryProvider, raw) ?? deliveryProviderValue
								}
								renderDisplay={(value) => deliveryLabel(value)}
								type="select"
								value={deliveryProviderValue}
							/>
						</div>
						<dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs">
							<dt>Үүссэн</dt>
							<dd className="text-right tabular-nums">{formatWhen(order.createdAt)}</dd>
							{order.updatedAt ? (
								<>
									<dt>Шинэчилсэн</dt>
									<dd className="text-right tabular-nums">{formatWhen(order.updatedAt)}</dd>
								</>
							) : null}
						</dl>
					</section>
				</div>
			</div>
		</>
	);
}

const whenFormat = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Ulaanbaatar",
	year: "numeric",
});
const formatWhen = (value: Date | string) => whenFormat.format(new Date(value));

function paymentDot(status: PaymentStatusType) {
	switch (status) {
		case "success":
			return "bg-emerald-600";
		case "failed":
			return "bg-red-600";
		default:
			return "bg-amber-500";
	}
}

function IconAction({
	children,
	href,
	label,
	onClick,
}: {
	children: React.ReactNode;
	href?: string;
	label: string;
	onClick?: () => void;
}) {
	const className =
		"text-foreground hover:bg-muted flex size-10 items-center justify-center rounded-full";
	return href ? (
		<a aria-label={label} className={className} href={href}>
			{children}
		</a>
	) : (
		<button aria-label={label} className={className} onClick={onClick} type="button">
			{children}
		</button>
	);
}
