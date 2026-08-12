/*
 * Ship dialog — one order. Loads delivery zones, picks one, calls shipOrder.
 * Only pending orders can be shipped (server enforces this too).
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
import { createEffect, createSignal, Show } from "solid-js";

import { DeliveryZoneSelect } from "./delivery-zone-select";
import { orderErrorMessage } from "./errors";
import { shipOrderMutationOptions } from "./mutations";
import { deliveryZonesQueryOptions } from "./queries";

interface ShipOrderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orderId: number;
	orderNumber: string;
	address: string;
	addressZoneId?: number;
	/** Called with the order id after the server confirms the shipment. */
	onShipped: (orderId: number) => void;
}

export function ShipOrderDialog(props: ShipOrderDialogProps) {
	const zonesQuery = createQuery(() => deliveryZonesQueryOptions());
	const shipOrder = createMutation(() => shipOrderMutationOptions());
	const [selectedZoneId, setSelectedZoneId] = createSignal<number | undefined>(
		props.addressZoneId,
	);

	// Seed the draft zone from the order when the dialog opens (legacy behaviour).
	createEffect(() => {
		if (props.open) {
			setSelectedZoneId(props.addressZoneId);
			shipOrder.reset();
		}
	});

	const zones = () => (zonesQuery.isSuccess ? (zonesQuery.data ?? []) : []);
	const zonesReady = () => zonesQuery.isSuccess && zones().length > 0;
	const selectedZoneExists = () =>
		zones().some((zone) => zone.Id === selectedZoneId());
	const canSubmit = () =>
		zonesReady() && selectedZoneExists() && !shipOrder.isPending;

	const handleShip = () => {
		const zoneId = selectedZoneId();
		if (zoneId === undefined) return;
		shipOrder.mutate(
			{ orderId: props.orderId, addressZoneId: zoneId },
			{
				onSuccess: () => {
					props.onOpenChange(false);
					props.onShipped(props.orderId);
				},
			},
		);
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Хүргэлтийн бүс сонгох</DialogTitle>
					<DialogDescription>
						#{props.orderNumber} захиалгыг TU руу илгээх
					</DialogDescription>
				</DialogHeader>

				<div class="grid grid-cols-1 gap-4">
					<div class="flex items-start gap-2.5 rounded-ui border border-rule bg-surface-2 p-3 text-ink text-sm">
						<MapPointIcon class="mt-0.5 size-4 shrink-0 text-ink-2" />
						<p class="min-w-0 break-words leading-relaxed">
							{props.address || "Хаяг оруулаагүй"}
						</p>
					</div>

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
							Одоогоор хүргэлтийн бүс алга байна. Хүргэлтийн бүс бүрдүүлсний
							дараа дахин оролдоно уу.
						</InlineAlert>
					</Show>

					<Show when={zones().length > 0}>
						<DeliveryZoneSelect
							id={`order-${props.orderId}-delivery-zone`}
							label="Хүргэлтийн бүс"
							zones={zones()}
							value={selectedZoneId()}
							onValueChange={setSelectedZoneId}
							disabled={!zonesReady() || shipOrder.isPending}
						/>
					</Show>

					<Show when={shipOrder.isError}>
						<InlineAlert tone="error">
							{orderErrorMessage(shipOrder.error)}
						</InlineAlert>
					</Show>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						disabled={shipOrder.isPending}
						onClick={() => props.onOpenChange(false)}
					>
						Болих
					</Button>
					<Button
						disabled={!canSubmit()}
						loading={shipOrder.isPending}
						onClick={handleShip}
					>
						{shipOrder.isPending ? "Илгээж байна…" : "TU руу илгээх"}
					</Button>
				</DialogFooter>
				<DialogCloseButton aria-label="Хаах" />
			</DialogContent>
		</Dialog>
	);
}
