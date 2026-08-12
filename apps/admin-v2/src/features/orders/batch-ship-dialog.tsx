/*
 * Batch ship dialog — ships the selected pending orders to TU, one delivery
 * zone per order. Sends sequentially with a single retry (legacy behaviour)
 * and reports per-order failures so the caller can resurface them.
 */

import { MapPointIcon } from "@solar-icons/solid/linear/map-point";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { createMutation, createQuery } from "@tanstack/solid-query";
import {
	Button,
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	InlineAlert,
	Skeleton,
} from "@vit/ui";
import { createEffect, createSignal, For, Show } from "solid-js";

import { DeliveryZoneSelect } from "./delivery-zone-select";
import { orderErrorMessage } from "./errors";
import { shipOrderMutationOptions } from "./mutations";
import type { OrderListItem } from "./queries";
import { deliveryZonesQueryOptions } from "./queries";

export interface BatchShipFailure {
	orderId: number;
	orderNumber: string;
	message: string;
}

export interface BatchShipResult {
	total: number;
	failed: BatchShipFailure[];
}

interface BatchShipOrderDialogProps {
	open: boolean;
	orders: OrderListItem[];
	onOpenChange: (open: boolean) => void;
	onComplete: (result: BatchShipResult) => void;
}

export function BatchShipOrderDialog(props: BatchShipOrderDialogProps) {
	const zonesQuery = createQuery(() => deliveryZonesQueryOptions());
	const shipOrder = createMutation(() => shipOrderMutationOptions());
	const [draftZoneIds, setDraftZoneIds] = createSignal<Record<number, number>>(
		{},
	);
	const [isSending, setIsSending] = createSignal(false);

	// Seed each order's zone from its saved addressZoneId when the dialog opens.
	createEffect(() => {
		if (!props.open) return;
		setDraftZoneIds((current) => {
			const next = { ...current };
			for (const order of props.orders) {
				if (next[order.id] === undefined && order.addressZoneId !== undefined) {
					next[order.id] = order.addressZoneId;
				}
			}
			return next;
		});
	});

	const zones = () => (zonesQuery.isSuccess ? (zonesQuery.data ?? []) : []);
	const zonesReady = () => zonesQuery.isSuccess && zones().length > 0;
	const canSubmit = () =>
		zonesReady() &&
		props.orders.length > 0 &&
		!isSending() &&
		props.orders.every((order) =>
			zones().some((zone) => zone.Id === draftZoneIds()[order.id]),
		);

	const sendWithRetry = async (
		orderId: number,
		addressZoneId: number,
	): Promise<{ ok: true } | { ok: false; message: string }> => {
		let lastMessage = "";
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				await shipOrder.mutateAsync({ orderId, addressZoneId });
				return { ok: true };
			} catch (error) {
				lastMessage = orderErrorMessage(error);
				if (attempt < 2) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}
		return { ok: false, message: lastMessage };
	};

	const handleSubmit = async () => {
		if (!canSubmit()) return;
		setIsSending(true);
		const failed: BatchShipFailure[] = [];
		for (const order of props.orders) {
			const addressZoneId = draftZoneIds()[order.id];
			if (addressZoneId === undefined) continue;
			const result = await sendWithRetry(order.id, addressZoneId);
			if (!result.ok) {
				failed.push({
					orderId: order.id,
					orderNumber: order.orderNumber,
					message: result.message,
				});
			}
		}
		props.onComplete({ total: props.orders.length, failed });
		setIsSending(false);
		props.onOpenChange(false);
	};

	return (
		<Dialog
			open={props.open}
			onOpenChange={(nextOpen) => {
				if (!isSending()) props.onOpenChange(nextOpen);
			}}
		>
			<DialogContent class="max-h-[85vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>TU хүргэлтийн бүс сонгох</DialogTitle>
					<DialogDescription>
						{props.orders.length} захиалга — бүрт нь хаягт тохирох бүс сонгоно
						уу
					</DialogDescription>
				</DialogHeader>

				<div class="grid grid-cols-1 gap-4">
					<Show when={zonesQuery.isPending}>
						<div class="grid grid-cols-1 gap-2">
							<Skeleton class="h-11 w-full" />
							<p class="text-ink-2 text-xs">
								Хүргэлтийн бүсүүдийг уншиж байна…
							</p>
						</div>
					</Show>

					<Show when={zonesQuery.isError}>
						<InlineAlert tone="error">
							Хүргэлтийн бүсүүдийг уншиж чадсангүй.
						</InlineAlert>
						<Button
							variant="secondary"
							class="w-full"
							onClick={() => zonesQuery.refetch()}
						>
							<RefreshIcon /> Дахин оролдох
						</Button>
					</Show>

					<Show when={zonesQuery.isSuccess && zones().length === 0}>
						<InlineAlert tone="warning">
							Одоогоор хүргэлтийн бүс алга байна.
						</InlineAlert>
					</Show>

					<For each={props.orders}>
						{(order) => (
							<div class="grid grid-cols-1 gap-3 rounded-ui border border-rule bg-surface-2/60 p-4">
								<div>
									<p class="font-bold text-ink">#{order.orderNumber}</p>
									<p class="mt-1 flex items-start gap-1.5 break-words text-ink-2 text-sm leading-relaxed">
										<MapPointIcon class="mt-0.5 size-4 shrink-0" />
										{order.address || "Хаяг оруулаагүй"}
									</p>
								</div>
								<DeliveryZoneSelect
									id={`batch-order-${order.id}-delivery-zone`}
									label={`#${order.orderNumber} хүргэлтийн бүс`}
									zones={zones()}
									value={draftZoneIds()[order.id]}
									onValueChange={(addressZoneId) =>
										setDraftZoneIds((current) => ({
											...current,
											[order.id]: addressZoneId,
										}))
									}
									disabled={!zonesReady() || isSending()}
								/>
							</div>
						)}
					</For>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						disabled={isSending()}
						onClick={() => props.onOpenChange(false)}
					>
						Болих
					</Button>
					<Button
						disabled={!canSubmit()}
						loading={isSending()}
						onClick={() => void handleSubmit()}
					>
						{isSending() ? "Илгээж байна…" : "TU руу илгээх"}
					</Button>
				</DialogFooter>
				<DialogCloseButton aria-label="Хаах" />
			</DialogContent>
		</Dialog>
	);
}
