/*
 * Order card — variant-B "triage agenda" glance card.
 *
 * One primary contextual action per status (contract §3.3):
 *   created → Бэлтгэж эхлэх (→ pending)
 *   pending → Илгээх (ship dialog)
 *   shipped → Хүргэгдсэн (→ delivered)
 *   delivered / cancelled / refunded → read-only (Дэлгэрэнгүй only)
 * The ••• menu holds Дэлгэрэнгүй / Засах / Цуцлах (legal until delivery) /
 * Устгах (with confirmation). No product images on cards — names/count only.
 */
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { BoxIcon } from "@solar-icons/solid/linear/box";
import { CopyIcon } from "@solar-icons/solid/linear/copy";
import { MapPointIcon } from "@solar-icons/solid/linear/map-point";
import { PhoneIcon } from "@solar-icons/solid/linear/phone";
import { createSignal, Show } from "solid-js";

import {
	Button,
	IconButton,
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
	showToast,
} from "@vit/ui";

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
	CANCELLABLE_STATUSES,
	mnt,
	ORDER_PRIMARY_ACTION,
	ORDER_STATUS_META,
	whenText,
} from "./labels";
import { orderKeys } from "./queries";
import type { OrderListItem } from "./queries";
import {
	deleteOrderMutationOptions,
	updateOrderStatusMutationOptions,
} from "./mutations";
import { OrderFormDialog } from "./order-form";
import { ShipOrderDialog } from "./ship-order-dialog";
import { OrderStatusBadge, PaymentStatusBadge } from "./status-badge";

interface OrderCardProps {
	order: OrderListItem;
	/** Pending orders are selectable for batch ship; others are not. */
	selectable: boolean;
	selected: boolean;
	onSelectionChange: (checked: boolean) => void;
}

export function OrderCard(props: OrderCardProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [shipOpen, setShipOpen] = createSignal(false);
	const [editOpen, setEditOpen] = createSignal(false);
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	const order = () => props.order;
	const productCount = () => order().products.length;
	const cancellable = () => CANCELLABLE_STATUSES.has(order().status);
	const primaryAction = () => ORDER_PRIMARY_ACTION[order().status];

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
			invalidateOrderCaches(queryClient);
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
		},
		onSettled: () => {
			invalidateOrderCaches(queryClient);
		},
	}));

	const openDetail = () => {
		navigate({
			to: "/orders/$orderId",
			params: { orderId: order().orderNumber },
		});
	};

	const handlePrimaryAction = () => {
		const action = primaryAction();
		if (!action) return;
		if (action.nextStatus) {
			statusMutation.mutate({ id: order().id, status: action.nextStatus });
		} else if (order().status === "pending") {
			setShipOpen(true);
		}
	};

	const handleCancel = () => {
		if (!cancellable()) return;
		statusMutation.mutate({ id: order().id, status: "cancelled" });
	};

	const handleShipped = (orderId: number) => {
		setOrderStatusInCaches(queryClient, orderId, "shipped");
		invalidateOrderCaches(queryClient, orderId);
		showToast({ title: "Захиалга TU руу илгээгдлээ", variant: "success" });
	};

	const copyAddress = async () => {
		try {
			await navigator.clipboard.writeText(order().address || "");
			showToast({ title: "Хаяг хуулагдлаа", variant: "success" });
		} catch {
			showToast({ title: "Хаяг хуулах боломжгүй", variant: "error" });
		}
	};

	const statusIcon = ORDER_STATUS_META[order().status].icon();

	return (
		<>
			<ShipOrderDialog
				open={shipOpen()}
				onOpenChange={setShipOpen}
				orderId={order().id}
				orderNumber={order().orderNumber}
				address={order().address}
				addressZoneId={order().addressZoneId}
				onShipped={handleShipped}
			/>

			<OrderFormDialog
				open={editOpen()}
				onOpenChange={setEditOpen}
				order={order()}
				onSaved={(orderId) => invalidateOrderCaches(queryClient, orderId)}
			/>

			<DeleteOrderDialog
				open={deleteOpen()}
				onOpenChange={setDeleteOpen}
				orderNumber={order().orderNumber}
				isPending={deleteMutation.isPending}
				error={deleteMutation.error}
				onConfirm={() => deleteMutation.mutate({ id: order().id })}
			/>

			<article
				data-status={order().status}
				class="grid gap-3 rounded-xl border border-rule bg-surface p-3.5 shadow-card"
			>
				{/* Row 1: status chip, number + customer, amount, menu */}
				<div class="flex items-center gap-3">
					<Show when={props.selectable}>
						<label class="flex shrink-0 cursor-pointer items-center">
							<input
								type="checkbox"
								checked={props.selected}
								onChange={(event) =>
									props.onSelectionChange(event.currentTarget.checked)
								}
								aria-label={`#${order().orderNumber} сонгох`}
								class="size-5 accent-butter"
							/>
						</label>
					</Show>
					<span
						aria-hidden="true"
						class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink"
					>
						{statusIcon}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate font-bold text-[15px] text-ink tabular-nums">
							#{order().orderNumber}
						</p>
						<p class="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2">
							<PhoneIcon class="size-3.5 shrink-0" />
							<a
								href={`tel:${order().customerPhone}`}
								class="tabular-nums underline-offset-2 hover:underline focus-visible:underline"
							>
								{order().customerPhone}
							</a>
							<span aria-hidden="true">·</span>
							<span>{productCount()} бараа</span>
						</p>
					</div>
					<p class="shrink-0 font-bold text-[15px] text-ink tabular-nums">
						{mnt(order().total)}
					</p>
					<Menu>
						<MenuTrigger
							as={IconButton}
							variant="secondary"
							label={`#${order().orderNumber} үйлдлүүд`}
						>
							•••
						</MenuTrigger>
						<MenuContent>
							<MenuItem onSelect={openDetail}>Дэлгэрэнгүй</MenuItem>
							<MenuItem onSelect={() => setEditOpen(true)}>Засах</MenuItem>
							<MenuSeparator />
							<MenuItem disabled={!cancellable()} onSelect={handleCancel}>
								Цуцлах
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

				{/* Row 2: status pills + age */}
				<div class="flex flex-wrap items-center gap-2">
					<PaymentStatusBadge status={order().paymentStatus} />
					<OrderStatusBadge status={order().status} />
					<span class="ml-auto shrink-0 text-ink-2 text-xs tabular-nums">
						{whenText(order().createdAt)}
					</span>
				</div>

				{/* Address + copy */}
				<div class="flex items-start gap-2 rounded-ui border border-rule bg-surface-2/50 px-3 py-2">
					<MapPointIcon class="mt-1 size-3.5 shrink-0 text-ink-2" />
					<p class="min-w-0 flex-1 break-words text-[13px] text-ink-2 leading-relaxed">
						{order().address || "Хаяг оруулаагүй"}
					</p>
					<IconButton
						variant="ghost"
						label="Хаяг хуулах"
						onClick={() => void copyAddress()}
					>
						<CopyIcon class="size-4" />
					</IconButton>
				</div>

				{/* Products — names and count only, no images */}
				<div class="flex items-center gap-2 text-[13px]">
					<BoxIcon class="size-4 shrink-0 text-ink-2" />
					<p
						class="min-w-0 truncate text-ink-2"
						title={order()
							.products.map((product) => product.name)
							.join(", ")}
					>
						{order()
							.products.map((product) => product.name)
							.join(", ") || "Бараа оруулаагүй"}
					</p>
				</div>

				{/* Actions — one primary + detail */}
				<div
					class={`grid gap-2 ${primaryAction() ? "grid-cols-2" : "grid-cols-1"}`}
				>
					<Show
						when={primaryAction()}
						fallback={
							<Button variant="secondary" onClick={openDetail}>
								Дэлгэрэнгүй
							</Button>
						}
					>
						<Button
							variant="primary"
							loading={statusMutation.isPending}
							disabled={statusMutation.isPending}
							onClick={handlePrimaryAction}
						>
							{primaryAction()?.label}
						</Button>
						<Button variant="secondary" onClick={openDetail}>
							Дэлгэрэнгүй
						</Button>
					</Show>
				</div>
			</article>
		</>
	);
}
