import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { PaymentStatusType } from "@vit/shared/types";
import {
	AlertTriangle,
	ArrowLeft,
	CalendarClock,
	CheckCircle,
	Copy,
	ExternalLink,
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	orderStatusLabel,
	paymentProviderLabel,
	paymentStatusLabel,
} from "@/lib/enum-labels";
import {
	formatCurrency,
	getPaymentProviderIcon,
	getPaymentStatusColor,
} from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/$id")({
	component: RouteComponent,
	pendingComponent: FormPageSkeleton,
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
				<div className="border-2 border-border bg-card p-6 shadow-hard">
					<h1 className="font-black font-heading text-xl">
						Захиалга олдсонгүй
					</h1>
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

	const { data: order } = useSuspenseQuery({
		...trpc.order.getOrderById.queryOptions({ id: orderId }),
	});

	if (!order) {
		return (
			<div className="mx-auto max-w-3xl p-4">
				<div className="border-2 border-border bg-card p-6 shadow-hard">
					<h1 className="font-black font-heading text-xl">
						Захиалга олдсонгүй
					</h1>
					<Button className="mt-4" onClick={() => navigate({ to: "/orders" })}>
						Буцах
					</Button>
				</div>
			</div>
		);
	}

	const invalidateOrder = () =>
		queryClient.invalidateQueries(
			trpc.order.getOrderById.queryOptions({ id: orderId }),
		);

	const { mutate: deleteOrder, isPending: isDeletePending } = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.order.getPaginatedOrders.queryOptions({}),
			);
			navigate({ to: "/orders" });
			toast.success("Захиалга устгагдлаа");
		},
	});

	const { mutate: updateOrderStatus, isPending: isUpdateStatusPending } =
		useMutation({
			...trpc.order.updateOrderStatus.mutationOptions(),
			onSuccess: () => {
				invalidateOrder();
				queryClient.invalidateQueries(
					trpc.order.getPaginatedOrders.queryOptions({}),
				);
				toast.success("Төлөв шинэчлэгдлээ");
			},
		});

	const { mutate: shipOrder, isPending: isShipOrderPending } = useMutation({
		...trpc.order.shipOrder.mutationOptions(),
		onSuccess: () => {
			invalidateOrder();
			queryClient.invalidateQueries(
				trpc.order.getPaginatedOrders.queryOptions({}),
			);
			toast.success("Захиалга илгээгдлээ");
		},
		onError: (error) => toast.error(error.message),
	});

	const { mutate: updateOrderField, isPending: isUpdateFieldPending } =
		useMutation({
			...trpc.order.updateOrder.mutationOptions(),
			onSuccess: () => {
				invalidateOrder();
				toast.success("Мэдээлэл хадгалагдлаа");
			},
		});

	const savePatch = (patch: Partial<typeof order>) =>
		updateOrderField({
			id: orderId,
			customerPhone: String(patch.customerPhone ?? order.customerPhone),
			status: patch.status ?? order.status,
			notes: patch.notes ?? order.notes,
			address: patch.address ?? order.address,
			addressZoneId: patch.addressZoneId ?? order.addressZoneId,
			products: order.products || [],
			paymentStatus: patch.paymentStatus ?? order.paymentStatus,
			deliveryProvider: patch.deliveryProvider ?? order.deliveryProvider,
			isNewCustomer: false,
		});

	const copy = async (text: string, label: string) => {
		await navigator.clipboard.writeText(text);
		toast.success(`${label} хуулагдлаа`);
	};

	const nextAction =
		order.status === "pending"
			? {
					label: "TU руу илгээх",
					icon: Truck,
					pending: isShipOrderPending,
					onClick: () => shipOrder({ orderId }),
				}
			: order.status === "shipped"
				? {
						label: "Хүргэсэн болгох",
						icon: CheckCircle,
						pending: isUpdateStatusPending,
						onClick: () =>
							updateOrderStatus({ id: orderId, status: "delivered" }),
					}
				: null;

	const itemCount =
		order.products?.reduce((sum, p) => sum + p.quantity, 0) ?? 0;
	const isPaid = order.paymentStatus === "success";
	const isPendingTransferClaim =
		order.paymentStatus === "customer_claimed_paid" &&
		order.paymentProvider === "transfer" &&
		Boolean(order.paymentNumber);
	const created = new Date(order.createdAt).toLocaleString("mn-MN");
	const updated = order.updatedAt
		? new Date(order.updatedAt).toLocaleString("mn-MN")
		: null;

	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-border border-b-2 px-6 pt-6 pb-4">
						<DialogTitle>Захиалга засах</DialogTitle>
						<DialogDescription>#{order.orderNumber}</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-3 sm:p-6">
						<OrderForm
							order={{
								...order,
								customerPhone: order.customerPhone.toString(),
								isNewCustomer: false,
							}}
							onSuccess={() => {
								setIsEditDialogOpen(false);
								invalidateOrder();
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<div className="mx-auto max-w-7xl space-y-4 px-3 py-4 pb-24 sm:px-4 sm:py-6 lg:px-6">
				<header className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<Button
							variant="outline"
							size="icon"
							className="h-11 w-11 shrink-0"
							onClick={() => navigate({ to: "/orders" })}
							aria-label="Захиалгууд руу буцах"
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div className="min-w-0">
							<h1 className="truncate font-black font-heading text-2xl tracking-tight sm:text-3xl">
								#{order.orderNumber}
							</h1>
							<p className="text-muted-foreground text-xs sm:text-sm">
								{created}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<OrderStatusBadge status={order.status} />
						<RowAction
							id={orderId}
							setIsEditDialogOpen={setIsEditDialogOpen}
							deleteMutation={(id) => deleteOrder({ id })}
							isDeletePending={isDeletePending}
						/>
					</div>
				</header>

				<section className="border-2 border-border bg-card p-4 shadow-hard sm:p-5">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<span
									className={`inline-flex items-center gap-1 border-2 px-2 py-1 font-bold text-xs ${getPaymentStatusColor(order.paymentStatus)}`}
								>
									{getPaymentProviderIcon(order.paymentProvider)}{" "}
									{paymentStatusLabel[order.paymentStatus]}
								</span>
								<span className="border-2 border-border bg-muted px-2 py-1 font-bold text-xs">
									{deliveryLabel(order.deliveryProvider)}
								</span>
								{!isPaid && (
									<span className="inline-flex items-center gap-1 border-2 border-destructive bg-error px-2 py-1 font-bold text-xs">
										<AlertTriangle className="h-3.5 w-3.5" /> Төлбөр шалгах
									</span>
								)}
							</div>
							<p className="max-w-2xl text-muted-foreground text-sm">
								Энэ дэлгэцийн гол ажил: хэрэглэгчтэй холбогдох, хаяг шалгах,
								барааг баталгаажуулах, хүргэлт рүү шилжүүлэх.
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
						<section className="border-2 border-border bg-card p-4 shadow-hard-sm sm:p-5">
							<div className="mb-4 flex items-center justify-between gap-3">
								<h2 className="flex items-center gap-2 font-black font-heading text-lg">
									<User className="h-5 w-5" /> Харилцагч
								</h2>
								<Button
									variant="outline"
									size="sm"
									className="h-10 gap-2"
									onClick={() =>
										(window.location.href = `tel:${order.customerPhone}`)
									}
								>
									<Phone className="h-4 w-4" /> Залгах
								</Button>
							</div>

							<div className="space-y-4">
								<InfoRow
									label="Утас"
									onCopy={() => copy(order.customerPhone.toString(), "Утас")}
								>
									<EditableField
										value={order.customerPhone.toString()}
										isLoading={isUpdateFieldPending}
										onSave={(next) => savePatch({ customerPhone: next })}
									/>
								</InfoRow>

								<InfoRow
									label="Хаяг"
									onCopy={() => copy(order.address || "", "Хаяг")}
								>
									<EditableField
										value={order.address || ""}
										type="textarea"
										isLoading={isUpdateFieldPending}
										onSave={(next) => savePatch({ address: next })}
									/>
								</InfoRow>

								<InfoRow label="Тэмдэглэл">
									<EditableField
										value={order.notes || ""}
										type="textarea"
										isLoading={isUpdateFieldPending}
										onSave={(next) => savePatch({ notes: next })}
										renderDisplay={(value) =>
											value || (
												<span className="text-muted-foreground">
													Тэмдэглэлгүй
												</span>
											)
										}
									/>
								</InfoRow>
							</div>
						</section>

						<section className="border-2 border-border bg-card p-4 shadow-hard-sm sm:p-5">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="flex items-center gap-2 font-black font-heading text-lg">
									<Package className="h-5 w-5" /> Бүтээгдэхүүн
								</h2>
								<span className="border-2 border-border bg-muted px-2 py-1 font-bold text-xs">
									{order.products?.length ?? 0} төрөл, {itemCount} ширхэг
								</span>
							</div>

							<div className="space-y-3">
								{order.products?.map((product, index) => (
									<div
										key={`${product.productId}-${index}`}
										className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-2 border-border bg-background p-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_7rem] sm:items-center sm:p-3"
									>
										<div className="h-16 w-16 overflow-hidden border-2 border-border bg-muted sm:h-18 sm:w-18">
											<img
												src={product.imageUrl || "/placeholder.jpg"}
												alt={product.name}
												className="h-full w-full object-cover"
												loading="lazy"
											/>
										</div>
										<div className="min-w-0">
											<h3 className="line-clamp-2 font-bold font-heading text-sm sm:text-base">
												{product.name}
											</h3>
											<p className="mt-1 text-muted-foreground text-xs">
												{product.quantity} × {formatCurrency(product.price)}
											</p>
										</div>
										<div className="col-span-2 flex items-center justify-between border-border border-t pt-2 sm:col-span-1 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
											<span className="text-muted-foreground text-xs sm:hidden">
												Дүн
											</span>
											<p className="font-black font-heading tabular-nums">
												{formatCurrency(product.price * product.quantity)}
											</p>
										</div>
									</div>
								))}
							</div>
						</section>
					</main>

					<aside className="space-y-4">
						<section className="border-2 border-border bg-card p-4 shadow-hard-sm sm:p-5">
							<h2 className="mb-4 flex items-center gap-2 font-black font-heading text-lg">
								<Receipt className="h-5 w-5" /> Төлбөр ба дүн
							</h2>
							<div className="space-y-4">
								<EditableField
									label="Төлөв"
									type="select"
									value={order.paymentStatus}
									options={[
										{ value: "pending", label: "Хүлээгдэж буй" },
										{
											value: "customer_claimed_paid",
											label: "Төлсөн гэж мэдэгдсэн",
										},
										{ value: "success", label: "Төлсөн" },
										{ value: "failed", label: "Амжилтгүй" },
									]}
									isLoading={isUpdateFieldPending}
									renderDisplay={(value) => (
										<span
											className={`inline-flex border-2 px-2 py-1 text-xs ${getPaymentStatusColor(value)}`}
										>
											{paymentStatusLabel[value as PaymentStatusType]}
										</span>
									)}
									onSave={(next) =>
										savePatch({
											paymentStatus: next as typeof order.paymentStatus,
										})
									}
								/>
								{isPendingTransferClaim && order.paymentNumber ? (
									<div className="space-y-2 border-2 border-primary/30 bg-primary/5 p-3">
										<p className="font-bold text-sm">
											Хэрэглэгч шилжүүлэг хийсэн гэж мэдэгдлээ
										</p>
										<p className="text-muted-foreground text-xs">
											Дансны орлого шалгаад доорх товчоор баталгаажуулна уу
										</p>
										<TransferPaymentActions
											paymentNumber={order.paymentNumber}
											onSuccess={() => {
												void invalidateOrder();
											}}
										/>
									</div>
								) : null}
								<div className="flex items-center justify-between border-border border-t pt-3 text-sm">
									<span className="text-muted-foreground">Хэрэгсэл</span>
									<span className="font-bold">
										{getPaymentProviderIcon(order.paymentProvider)}{" "}
										{order.paymentProvider
											? paymentProviderLabel[order.paymentProvider]
											: "Тодорхойгүй"}
									</span>
								</div>
								<div className="flex items-center justify-between border-border border-t pt-3 text-sm">
									<span className="text-muted-foreground">Нийт ширхэг</span>
									<span className="font-bold">{itemCount}</span>
								</div>
								<div className="flex items-end justify-between border-border border-t-2 pt-4">
									<span className="font-black font-heading">Нийт</span>
									<span className="font-black font-heading text-2xl tabular-nums">
										{formatCurrency(order.total)}
									</span>
								</div>
							</div>
						</section>

						<section className="border-2 border-border bg-card p-4 shadow-hard-sm sm:p-5">
							<h2 className="mb-4 flex items-center gap-2 font-black font-heading text-lg">
								<Truck className="h-5 w-5" /> Хүргэлт
							</h2>
							<EditableField
								label="Арга"
								type="select"
								value={order.deliveryProvider || "tu-delivery"}
								options={[
									{ value: "tu-delivery", label: "TU delivery" },
									{ value: "self", label: "Өөрсдөө хүргэнэ" },
									{ value: "avidaa", label: "Avidaa" },
									{ value: "pick-up", label: "Өөрөө авна" },
								]}
								isLoading={isUpdateFieldPending}
								renderDisplay={(value) => deliveryLabel(value)}
								onSave={(next) =>
									savePatch({
										deliveryProvider: next as typeof order.deliveryProvider,
									})
								}
							/>
							<Button
								variant="outline"
								className="mt-4 h-11 w-full gap-2"
								onClick={() => copy(order.address || "", "Хүргэлтийн хаяг")}
							>
								<MapPin className="h-4 w-4" /> Хаяг хуулах
							</Button>
						</section>

						<section className="border-2 border-border bg-card p-4 shadow-hard-sm sm:p-5">
							<h2 className="mb-4 flex items-center gap-2 font-black font-heading text-lg">
								<CalendarClock className="h-5 w-5" /> Түүх
							</h2>
							<div className="space-y-3 text-sm">
								<TimelineRow label="Захиалга үүссэн" value={created} active />
								{updated && (
									<TimelineRow
										label="Сүүлд шинэчлэгдсэн"
										value={updated}
										active={order.status !== "pending"}
									/>
								)}
								<TimelineRow
									label={`Одоогийн төлөв: ${orderStatusLabel[order.status]}`}
									value={paymentStatusLabel[order.paymentStatus]}
									active={isPaid}
								/>
							</div>
						</section>
					</aside>
				</div>
			</div>

			{nextAction && (
				<div className="fixed inset-x-0 bottom-0 z-40 border-border border-t-2 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:hidden">
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
	label,
	children,
	onCopy,
}: {
	label: string;
	children: React.ReactNode;
	onCopy?: () => void;
}) {
	return (
		<div className="border-border border-t pt-3 first:border-t-0 first:pt-0">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<p className="font-bold font-heading text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				{onCopy && (
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onCopy}
					>
						<Copy className="h-3.5 w-3.5" />
					</Button>
				)}
			</div>
			{children}
		</div>
	);
}

function TimelineRow({
	label,
	value,
	active,
}: {
	label: string;
	value: string;
	active?: boolean;
}) {
	return (
		<div className="flex gap-3">
			<div
				className={`mt-1.5 h-3 w-3 shrink-0 border-2 border-border ${active ? "bg-primary" : "bg-muted"}`}
			/>
			<div>
				<p className="font-bold leading-tight">{label}</p>
				<p className="text-muted-foreground text-xs">{value}</p>
			</div>
		</div>
	);
}
