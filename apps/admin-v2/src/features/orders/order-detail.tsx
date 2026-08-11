/*
 * Order detail page — single-task flow.
 *
 * The route param may be an 8-char alphanumeric order code (Y5WDHJC0) or a
 * numeric id. Codes resolve via getOrderIdByOrderNumber → getOrderById
 * (contract §3.2 — never Number() an 8-char code). Sections: customer,
 * products (images live ONLY here), payment, delivery, history, and one
 * next-action button following the legal transition graph.
 */
import {
	createMutation,
	createQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { useNavigate, useParams } from "@tanstack/solid-router";
import { ArrowLeftIcon } from "@solar-icons/solid/linear/arrow-left";
import { BoxIcon } from "@solar-icons/solid/linear/box";
import { CalendarIcon } from "@solar-icons/solid/linear/calendar";
import { CheckReadIcon } from "@solar-icons/solid/linear/check-read";
import { CopyIcon } from "@solar-icons/solid/linear/copy";
import { MapPointIcon } from "@solar-icons/solid/linear/map-point";
import { PhoneIcon } from "@solar-icons/solid/linear/phone";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { RouteIcon } from "@solar-icons/solid/linear/route";
import { UserIcon } from "@solar-icons/solid/linear/user";
import { WalletIcon } from "@solar-icons/solid/linear/wallet";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import type { JSX } from "solid-js";

import {
	Button,
	EmptyState,
	IconButton,
	InlineAlert,
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
	Skeleton,
	showToast,
} from "@vit/ui";
import { isTRPCClientError } from "@trpc/client";

import {
	invalidateOrderCaches,
	removeOrderFromListCaches,
	restoreOrderLists,
	setOrderStatusInCaches,
	snapshotOrderLists,
} from "./cache";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { orderErrorMessage } from "./errors";
import {
	dateTimeText,
	deliveryProviderLabel,
	mnt,
	ORDER_PRIMARY_ACTION,
	ORDER_STATUS_META,
	PAYMENT_PROVIDER_LABEL,
	PAYMENT_STATUS_META,
	whenText,
} from "./labels";
import {
	deleteOrderMutationOptions,
	updateOrderStatusMutationOptions,
} from "./mutations";
import { OrderFormDialog } from "./order-form";
import {
	deliveryZonesQueryOptions,
	orderDetailQueryOptions,
	orderIdByNumberQueryOptions,
	orderKeys,
} from "./queries";
import { ShipOrderDialog } from "./ship-order-dialog";
import { OrderStatusBadge, PaymentStatusBadge } from "./status-badge";

const ORDER_CODE_LENGTH = 8;

export function OrderDetailPage() {
	const params = useParams({ from: "/_app/orders/$orderId" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const orderIdParam = () => params().orderId;
	const isOrderCode = () => orderIdParam().length === ORDER_CODE_LENGTH;

	// Step 1: resolve an 8-char code to its numeric id (never Number() it).
	const idLookup = createQuery(() => ({
		...orderIdByNumberQueryOptions(orderIdParam()),
		enabled: isOrderCode(),
	}));

	const numericId = createMemo(() => {
		if (isOrderCode()) {
			return idLookup.isSuccess ? (idLookup.data ?? null) : null;
		}
		const parsed = Number(orderIdParam());
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	});

	const detailQuery = createQuery(() => ({
		...orderDetailQueryOptions(numericId() ?? 0),
		enabled: numericId() !== null && (!isOrderCode() || idLookup.isSuccess),
	}));

	// `.data` suspends while the query is loading; gate the read on isSuccess.
	const order = () => (detailQuery.isSuccess ? detailQuery.data : undefined);

	const isNotFound = createMemo(
		() =>
			(isOrderCode() && idLookup.isSuccess && idLookup.data === null) ||
			(!isOrderCode() && numericId() === null) ||
			(detailQuery.isError &&
				isTRPCClientError(detailQuery.error) &&
				detailQuery.error.data?.code === "NOT_FOUND"),
	);

	const [shipOpen, setShipOpen] = createSignal(false);
	const [editOpen, setEditOpen] = createSignal(false);
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	const zonesQuery = createQuery(() => ({
		...deliveryZonesQueryOptions(),
		enabled: order()?.addressZoneId !== undefined,
	}));

	const statusMutation = createMutation(() => ({
		...updateOrderStatusMutationOptions(),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: orderKeys.lists() });
			const snapshot = snapshotOrderLists(queryClient);
			setOrderStatusInCaches(queryClient, variables.id, variables.status);
			return { snapshot };
		},
		onError: (error, _variables, context) => {
			if (context?.snapshot) restoreOrderLists(queryClient, context.snapshot);
			showToast({ title: orderErrorMessage(error), variant: "error" });
		},
		onSuccess: () => {
			showToast({ title: "Төлөв шинэчлэгдлээ", variant: "success" });
		},
		onSettled: () => {
			const id = numericId();
			invalidateOrderCaches(queryClient, id ?? undefined);
		},
	}));

	const deleteMutation = createMutation(() => ({
		...deleteOrderMutationOptions(),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: orderKeys.lists() });
			const snapshot = snapshotOrderLists(queryClient);
			removeOrderFromListCaches(queryClient, variables.id);
			return { snapshot };
		},
		onError: (error, _variables, context) => {
			if (context?.snapshot) restoreOrderLists(queryClient, context.snapshot);
			showToast({ title: orderErrorMessage(error), variant: "error" });
		},
		onSuccess: () => {
			showToast({ title: "Захиалга устгагдлаа", variant: "success" });
			void navigate({ to: "/orders" });
		},
	}));

	const primaryAction = () => {
		const orderData = order();
		if (!orderData) return null;
		const action = ORDER_PRIMARY_ACTION[orderData.status];
		if (!action) return null;
		return {
			label: action.label,
			run: () => {
				if (action.nextStatus) {
					statusMutation.mutate({
						id: orderData.id,
						status: action.nextStatus,
					});
				} else if (orderData.status === "pending") {
					setShipOpen(true);
				}
			},
		};
	};

	const handleShipped = (orderId: number) => {
		setOrderStatusInCaches(queryClient, orderId, "shipped");
		invalidateOrderCaches(queryClient, orderId);
		showToast({ title: "Захиалга TU руу илгээгдлээ", variant: "success" });
	};

	const copyText = async (text: string, label: string) => {
		try {
			await navigator.clipboard.writeText(text);
			showToast({ title: `${label} хуулагдлаа`, variant: "success" });
		} catch {
			showToast({ title: "Хуулах боломжгүй", variant: "error" });
		}
	};

	const zoneName = () => {
		const orderData = order();
		if (!orderData?.addressZoneId) return undefined;
		const zones = zonesQuery.isSuccess ? zonesQuery.data : undefined;
		return (
			zones?.find((zone) => zone.Id === orderData.addressZoneId)?.zoneName ??
			`Бүс #${orderData.addressZoneId}`
		);
	};

	// ---------- one reactive tree: not-found / loading / error / loaded ----------
	return (
		<Switch>
			<Match when={isNotFound()}>
				<EmptyState
					icon={<BoxIcon />}
					title="Захиалга олдсонгүй"
					description="Энэ дугаартай захиалга байхгүй эсвэл устгагдсан байна."
					action={
						<Button
							variant="secondary"
							onClick={() => navigate({ to: "/orders" })}
						>
							Захиалгууд руу буцах
						</Button>
					}
				/>
			</Match>

			<Match when={detailQuery.isPending}>
				<div class="grid gap-4">
					<Skeleton class="h-10 w-40" />
					<Skeleton class="h-28 w-full" />
					<Skeleton class="h-56 w-full" />
					<Skeleton class="h-40 w-full" />
				</div>
			</Match>

			<Match when={detailQuery.isError}>
				<InlineAlert tone="error">
					Захиалгыг ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.
				</InlineAlert>
				<Button
					variant="secondary"
					class="w-full"
					onClick={() => detailQuery.refetch()}
				>
					<RefreshIcon /> Дахин оролдох
				</Button>
			</Match>

			<Match when={order()}>
				{(orderData) => {
					const itemCount = orderData().products.reduce(
						(sum, product) => sum + product.quantity,
						0,
					);
					const nextAction = primaryAction();
					return (
						<div class="grid gap-4">
							<ShipOrderDialog
								open={shipOpen()}
								onOpenChange={setShipOpen}
								orderId={orderData().id}
								orderNumber={orderData().orderNumber}
								address={orderData().address}
								addressZoneId={orderData().addressZoneId}
								onShipped={handleShipped}
							/>

							<OrderFormDialog
								open={editOpen()}
								onOpenChange={setEditOpen}
								order={orderData()}
								onSaved={(orderId) =>
									invalidateOrderCaches(queryClient, orderId)
								}
							/>

							<DeleteOrderDialog
								open={deleteOpen()}
								onOpenChange={setDeleteOpen}
								orderNumber={orderData().orderNumber}
								isPending={deleteMutation.isPending}
								error={deleteMutation.error}
								onConfirm={() => deleteMutation.mutate({ id: orderData().id })}
							/>

							<header class="flex items-center gap-3">
								<IconButton
									variant="outline"
									label="Захиалгууд руу буцах"
									onClick={() => navigate({ to: "/orders" })}
								>
									<ArrowLeftIcon class="size-5" />
								</IconButton>
								<div class="min-w-0 flex-1">
									<h1 class="truncate font-extrabold text-ink text-xl tracking-tight">
										#{orderData().orderNumber}
									</h1>
									<p class="text-ink-2 text-xs tabular-nums">
										{dateTimeText(orderData().createdAt)}
									</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<PaymentStatusBadge status={orderData().paymentStatus} />
									<OrderStatusBadge status={orderData().status} />
									<Menu>
										<MenuTrigger
											as={IconButton}
											variant="secondary"
											label={`#${orderData().orderNumber} үйлдлүүд`}
										>
											•••
										</MenuTrigger>
										<MenuContent>
											<MenuItem onSelect={() => setEditOpen(true)}>
												Засах
											</MenuItem>
											<MenuSeparator />
											<MenuItem
												class="text-coral-ink"
												onSelect={() => setDeleteOpen(true)}
											>
												Устгах
											</MenuItem>
										</MenuContent>
									</Menu>
								</div>
							</header>

							{/* Next-action strip */}
							<Show when={nextAction}>
								{(action) => (
									<div class="rounded-xl bg-ink p-4 text-canvas">
										<p class="font-bold text-[11px] text-canvas/60 uppercase tracking-[0.08em]">
											Дараагийн үйлдэл
										</p>
										<div class="mt-2 flex flex-wrap items-center justify-between gap-3">
											<div>
												<p class="font-bold text-[15px] tabular-nums">
													{orderData().orderNumber} · {mnt(orderData().total)}
												</p>
												<p class="mt-0.5 text-[13px] text-canvas/70">
													{orderData().customerPhone} ·{" "}
													{orderData().products.length} бараа
												</p>
											</div>
											<Button
												variant="primary"
												loading={statusMutation.isPending}
												disabled={statusMutation.isPending}
												onClick={action().run}
											>
												{statusMutation.isPending
													? "Ажиллаж байна…"
													: action().label}
											</Button>
										</div>
									</div>
								)}
							</Show>

							{/* Customer */}
							<section
								class="grid gap-4 rounded-xl border border-rule bg-surface p-4 shadow-card"
								aria-labelledby="customer-heading"
							>
								<h2
									id="customer-heading"
									class="flex items-center gap-2 font-bold text-base text-ink"
								>
									<UserIcon class="size-5 text-ink-2" /> Харилцагч
								</h2>
								<div class="grid gap-3">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span class="font-bold text-ink-2 text-xs uppercase tracking-wide">
											Утас
										</span>
										<div class="flex items-center gap-2">
											<a
												href={`tel:${orderData().customerPhone}`}
												class="flex min-h-11 items-center gap-2 rounded-ui border border-rule bg-surface px-3 font-bold text-ink text-sm tabular-nums hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
											>
												<PhoneIcon class="size-4" /> {orderData().customerPhone}
											</a>
											<IconButton
												variant="ghost"
												label="Утас хуулах"
												onClick={() =>
													void copyText(orderData().customerPhone, "Утас")
												}
											>
												<CopyIcon class="size-4" />
											</IconButton>
										</div>
									</div>
									<div class="flex flex-wrap items-start justify-between gap-2">
										<span class="font-bold text-ink-2 text-xs uppercase tracking-wide">
											Хаяг
										</span>
										<p class="max-w-xs break-words text-right text-ink text-sm leading-relaxed">
											{orderData().address || "Хаяг оруулаагүй"}
										</p>
									</div>
									<div class="flex flex-wrap items-start justify-between gap-2">
										<span class="font-bold text-ink-2 text-xs uppercase tracking-wide">
											Тэмдэглэл
										</span>
										<p class="max-w-xs break-words text-right text-ink text-sm leading-relaxed">
											{orderData().notes || "Тэмдэглэлгүй"}
										</p>
									</div>
								</div>
							</section>

							{/* Products */}
							<section
								class="grid gap-3 rounded-xl border border-rule bg-surface p-4 shadow-card"
								aria-labelledby="products-heading"
							>
								<h2
									id="products-heading"
									class="flex items-center gap-2 font-bold text-base text-ink"
								>
									<BoxIcon class="size-5 text-ink-2" /> Бүтээгдэхүүн
									<span class="ml-auto font-bold text-ink-2 text-xs tabular-nums">
										{orderData().products.length} төрөл, {itemCount} ширхэг
									</span>
								</h2>
								<ul class="grid gap-2.5">
									<For each={orderData().products}>
										{(product) => (
											<li class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-ui border border-rule bg-surface-2/50 p-2.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
												<Show
													when={product.imageUrl}
													fallback={
														<span class="grid size-14 place-items-center rounded-lg bg-surface-2 text-ink-2">
															<BoxIcon class="size-6" />
														</span>
													}
												>
													{(url) => (
														<img
															src={url()}
															alt={product.name}
															class="size-14 rounded-lg border border-rule object-cover"
															loading="lazy"
														/>
													)}
												</Show>
												<div class="min-w-0">
													<p class="break-words font-bold text-ink text-sm leading-snug">
														{product.name}
													</p>
													<p class="mt-0.5 text-ink-2 text-xs tabular-nums">
														{product.quantity} × {mnt(product.price)}
													</p>
												</div>
												<p class="col-span-2 font-bold text-ink text-sm tabular-nums sm:col-span-1 sm:text-right">
													{mnt(product.price * product.quantity)}
												</p>
											</li>
										)}
									</For>
								</ul>
							</section>

							{/* Payment */}
							<section
								class="grid gap-3 rounded-xl border border-rule bg-surface p-4 shadow-card"
								aria-labelledby="payment-heading"
							>
								<h2
									id="payment-heading"
									class="flex items-center gap-2 font-bold text-base text-ink"
								>
									<WalletIcon class="size-5 text-ink-2" /> Төлбөр ба дүн
								</h2>
								<div class="grid gap-2.5 text-sm">
									<div class="flex items-center justify-between gap-2">
										<span class="text-ink-2">Төлбөрийн төлөв</span>
										<PaymentStatusBadge status={orderData().paymentStatus} />
									</div>
									<div class="flex items-center justify-between gap-2">
										<span class="text-ink-2">Хэрэгсэл</span>
										<span class="font-bold text-ink">
											{PAYMENT_PROVIDER_LABEL[orderData().paymentProvider] ??
												"Тодорхойгүй"}
										</span>
									</div>
									<Show when={orderData().paymentNumber}>
										{(paymentNumber) => (
											<div class="flex items-center justify-between gap-2">
												<span class="text-ink-2">Гүйлгээний дугаар</span>
												<button
													type="button"
													class="font-bold text-ink tabular-nums underline-offset-2 hover:underline focus-visible:underline"
													onClick={() =>
														void copyText(paymentNumber(), "Гүйлгээний дугаар")
													}
												>
													{paymentNumber()}
												</button>
											</div>
										)}
									</Show>
									<div class="flex items-center justify-between gap-2 border-rule border-t pt-3">
										<span class="font-bold text-ink">Нийт</span>
										<span class="font-extrabold text-ink text-xl tabular-nums">
											{mnt(orderData().total)}
										</span>
									</div>
								</div>
							</section>

							{/* Delivery */}
							<section
								class="grid gap-3 rounded-xl border border-rule bg-surface p-4 shadow-card"
								aria-labelledby="delivery-heading"
							>
								<h2
									id="delivery-heading"
									class="flex items-center gap-2 font-bold text-base text-ink"
								>
									<RouteIcon class="size-5 text-ink-2" /> Хүргэлт
								</h2>
								<div class="grid gap-2.5 text-sm">
									<div class="flex items-center justify-between gap-2">
										<span class="text-ink-2">Арга</span>
										<span class="font-bold text-ink">
											{deliveryProviderLabel(orderData().deliveryProvider)}
										</span>
									</div>
									<Show when={zoneName()}>
										{(zone) => (
											<div class="flex items-center justify-between gap-2">
												<span class="text-ink-2">Хүргэлтийн бүс</span>
												<span class="font-bold text-ink">{zone()}</span>
											</div>
										)}
									</Show>
									<Button
										variant="secondary"
										class="w-full"
										onClick={() =>
											void copyText(orderData().address, "Хүргэлтийн хаяг")
										}
									>
										<MapPointIcon class="size-4" /> Хаяг хуулах
									</Button>
								</div>
							</section>

							{/* History */}
							<section
								class="grid gap-3 rounded-xl border border-rule bg-surface p-4 shadow-card"
								aria-labelledby="history-heading"
							>
								<h2
									id="history-heading"
									class="flex items-center gap-2 font-bold text-base text-ink"
								>
									<CalendarIcon class="size-5 text-ink-2" /> Түүх
								</h2>
								<ul class="grid gap-2.5 text-sm">
									<TimelineRow
										label="Захиалга үүссэн"
										value={dateTimeText(orderData().createdAt)}
										icon={<CheckReadIcon class="size-3.5" />}
										active
									/>
									<Show when={orderData().updatedAt}>
										{(updatedAt) => (
											<TimelineRow
												label="Сүүлд шинэчлэгдсэн"
												value={dateTimeText(updatedAt())}
												icon={<RefreshIcon class="size-3.5" />}
											/>
										)}
									</Show>
									<TimelineRow
										label={`Одоогийн төлөв: ${ORDER_STATUS_META[orderData().status].label}`}
										value={PAYMENT_STATUS_META[orderData().paymentStatus].label}
										icon={ORDER_STATUS_META[orderData().status].icon()}
									/>
								</ul>
							</section>

							{/* Age footnote */}
							<p class="text-ink-2 text-xs tabular-nums">
								Орсон: {whenText(orderData().createdAt)}
							</p>
						</div>
					);
				}}
			</Match>
		</Switch>
	);
}

function TimelineRow(props: {
	label: string;
	value: string;
	icon: JSX.Element;
	active?: boolean;
}) {
	return (
		<li class="flex items-start gap-3">
			<span
				aria-hidden="true"
				class={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
					props.active ? "bg-butter text-butter-ink" : "bg-surface-2 text-ink-2"
				}`}
			>
				{props.icon}
			</span>
			<div>
				<p class="font-bold text-ink leading-tight">{props.label}</p>
				<p class="mt-0.5 text-ink-2 text-xs tabular-nums">{props.value}</p>
			</div>
		</li>
	);
}
