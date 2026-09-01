import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { mutationErrorMessage } from "@/lib/mutation-error";
import { trpc } from "@/utils/trpc";
import { DeliveryZoneSelect } from "./delivery-zone-select";

interface BatchShipOrder {
	address: string;
	addressZoneId?: number;
	id: number;
	orderNumber: string;
}

export interface BatchShipResult {
	failed: Array<{
		message: string;
		orderId: number;
		orderNumber: string;
	}>;
	total: number;
}

interface BatchShipOrderDialogProps {
	onComplete: (result: BatchShipResult) => void | Promise<void>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	orders: Array<BatchShipOrder>;
}

function buildInitialZoneIds(orders: Array<BatchShipOrder>) {
	return Object.fromEntries(orders.map((order) => [order.id, order.addressZoneId]));
}

function BatchShipOrderDialogContent({
	onComplete,
	onOpenChange,
	orders,
}: Omit<BatchShipOrderDialogProps, "open">) {
	const [draftZoneIds, setDraftZoneIds] = useState<Record<number, number | undefined>>(() =>
		buildInitialZoneIds(orders),
	);
	const [isSending, setIsSending] = useState(false);
	const zonesQuery = useQuery({
		...trpc.order.getDeliveryAddressZones.queryOptions(),
		staleTime: 1000 * 60 * 60 * 24,
	});
	const shipOrder = useMutation(trpc.order.shipOrder.mutationOptions());

	const zones = zonesQuery.data ?? [];
	const zonesReady = zonesQuery.isSuccess && zones.length > 0;
	const canSubmit =
		zonesReady &&
		orders.length > 0 &&
		orders.every((order) => zones.some((zone) => zone.id === draftZoneIds[order.id])) &&
		!isSending;

	const sendWithRetry = async (orderId: number, addressZoneId: number) => {
		let lastMessage = "";
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				await shipOrder.mutateAsync({ addressZoneId, orderId });
				return { ok: true as const };
			} catch (error) {
				lastMessage = error instanceof Error ? mutationErrorMessage(error) : "Алдаа гарлаа";
				if (attempt < 2) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}
		return { message: lastMessage, ok: false as const };
	};

	const handleSubmit = async () => {
		if (!canSubmit) {
			return;
		}
		setIsSending(true);
		const failed: BatchShipResult["failed"] = [];

		for (const order of orders) {
			const addressZoneId = draftZoneIds[order.id];
			if (addressZoneId === undefined) {
				continue;
			}
			const result = await sendWithRetry(order.id, addressZoneId);
			if (!result.ok) {
				failed.push({
					message: result.message,
					orderId: order.id,
					orderNumber: order.orderNumber,
				});
			}
		}

		await onComplete({ failed, total: orders.length });
		setIsSending(false);
		onOpenChange(false);
	};

	return (
		<DialogContent className="border-border bg-card shadow-hard max-h-[85vh] max-w-[95vw] overflow-y-auto border-2 sm:max-w-2xl">
			<DialogHeader className="px-4 sm:px-6">
				<DialogTitle>TU хүргэлтийн бүс сонгох</DialogTitle>
				<DialogDescription>Захиалга бүрт хаягт нь тохирох бүс сонгоно уу</DialogDescription>
			</DialogHeader>

			<div className="space-y-4 p-4 sm:p-6">
				{zonesQuery.isLoading ? (
					<output className="text-muted-foreground flex items-center text-sm">
						<Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
						Хүргэлтийн бүсүүдийг уншиж байна...
					</output>
				) : null}
				{zonesQuery.isError ? (
					<div
						className="text-destructive flex items-center justify-between gap-3 text-sm"
						role="alert"
					>
						<span>Хүргэлтийн бүсүүдийг уншиж чадсангүй.</span>
						<Button
							onClick={() => void zonesQuery.refetch()}
							size="sm"
							type="button"
							variant="outline"
						>
							Дахин оролдох
						</Button>
					</div>
				) : null}
				{zonesQuery.isSuccess && zones.length === 0 ? (
					<p className="text-destructive text-sm" role="alert">
						Одоогоор хүргэлтийн бүс алга байна.
					</p>
				) : null}

				{orders.map((order) => (
					<div className="border-border bg-background space-y-3 border-2 p-4" key={order.id}>
						<div>
							<p className="font-heading font-black">#{order.orderNumber}</p>
							<p className="text-muted-foreground mt-1 text-sm">
								{order.address || "Хаяг оруулаагүй"}
							</p>
						</div>
						<DeliveryZoneSelect
							disabled={!zonesReady || isSending}
							id={`batch-order-${order.id}-delivery-zone`}
							label={`#${order.orderNumber} хүргэлтийн бүс`}
							onValueChange={(addressZoneId) =>
								setDraftZoneIds((current) => ({
									...current,
									[order.id]: addressZoneId,
								}))
							}
							value={draftZoneIds[order.id]}
							zones={zones}
						/>
					</div>
				))}
			</div>

			<DialogFooter className="px-4 py-3 sm:px-6" position="static">
				<Button
					disabled={isSending}
					onClick={() => onOpenChange(false)}
					type="button"
					variant="outline"
				>
					Болих
				</Button>
				<Button disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
					{isSending ? (
						<Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					{isSending ? "Илгээж байна..." : "TU руу илгээх"}
				</Button>
			</DialogFooter>
		</DialogContent>
	);
}

export default function BatchShipOrderDialog({
	onComplete,
	onOpenChange,
	open,
	orders,
}: BatchShipOrderDialogProps) {
	const dialogKey = orders.map((order) => `${order.id}:${order.addressZoneId ?? ""}`).join(",");

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			{open ? (
				<BatchShipOrderDialogContent
					key={dialogKey}
					onComplete={onComplete}
					onOpenChange={onOpenChange}
					orders={orders}
				/>
			) : null}
		</Dialog>
	);
}
