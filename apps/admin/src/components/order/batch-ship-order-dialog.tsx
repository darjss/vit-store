import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/utils/trpc";
import { DeliveryZoneSelect } from "./delivery-zone-select";

interface BatchShipOrder {
	id: number;
	orderNumber: string;
	address: string;
	addressZoneId?: number;
}

export interface BatchShipResult {
	total: number;
	failed: {
		orderId: number;
		orderNumber: string;
		message: string;
	}[];
}

interface BatchShipOrderDialogProps {
	open: boolean;
	orders: BatchShipOrder[];
	onOpenChange: (open: boolean) => void;
	onComplete: (result: BatchShipResult) => void | Promise<void>;
}

function trpcErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Алдаа гарлаа";
}

export default function BatchShipOrderDialog({
	open,
	orders,
	onOpenChange,
	onComplete,
}: BatchShipOrderDialogProps) {
	const [draftZoneIds, setDraftZoneIds] = useState<
		Record<number, number | undefined>
	>({});
	const [isSending, setIsSending] = useState(false);
	const zonesQuery = useQuery({
		...trpc.order.getDeliveryAddressZones.queryOptions(),
		enabled: open,
		staleTime: 1000 * 60 * 60 * 24,
	});
	const shipOrder = useMutation(trpc.order.shipOrder.mutationOptions());

	useEffect(() => {
		if (!open) return;
		setDraftZoneIds((current) =>
			Object.fromEntries(
				orders.map((order) => [
					order.id,
					current[order.id] ?? order.addressZoneId,
				]),
			),
		);
	}, [open, orders]);

	const zones = zonesQuery.data ?? [];
	const zonesReady = zonesQuery.isSuccess && zones.length > 0;
	const canSubmit =
		zonesReady &&
		orders.length > 0 &&
		orders.every((order) =>
			zones.some((zone) => zone.id === draftZoneIds[order.id]),
		) &&
		!isSending;

	const sendWithRetry = async (orderId: number, addressZoneId: number) => {
		let lastMessage = "";
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				await shipOrder.mutateAsync({ orderId, addressZoneId });
				return { ok: true as const };
			} catch (error) {
				lastMessage = trpcErrorMessage(error);
				if (attempt < 2) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		}
		return { ok: false as const, message: lastMessage };
	};

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSending(true);
		const failed: BatchShipResult["failed"] = [];

		for (const order of orders) {
			const addressZoneId = draftZoneIds[order.id];
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

		await onComplete({ total: orders.length, failed });
		setIsSending(false);
		onOpenChange(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!isSending) onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="max-h-[85vh] max-w-[95vw] overflow-y-auto border-2 border-border bg-card shadow-hard sm:max-w-2xl">
				<DialogHeader className="px-4 sm:px-6">
					<DialogTitle>TU хүргэлтийн бүс сонгох</DialogTitle>
					<DialogDescription>
						Захиалга бүрт хаягт нь тохирох бүс сонгоно уу
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 p-4 sm:p-6">
					{zonesQuery.isLoading ? (
						<output className="flex items-center text-muted-foreground text-sm">
							<Loader2
								className="mr-2 h-4 w-4 animate-spin"
								aria-hidden="true"
							/>
							Хүргэлтийн бүсүүдийг уншиж байна...
						</output>
					) : null}
					{zonesQuery.isError ? (
						<div
							className="flex items-center justify-between gap-3 text-destructive text-sm"
							role="alert"
						>
							<span>Хүргэлтийн бүсүүдийг уншиж чадсангүй.</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void zonesQuery.refetch()}
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
						<div
							key={order.id}
							className="space-y-3 border-2 border-border bg-background p-4"
						>
							<div>
								<p className="font-black font-heading">#{order.orderNumber}</p>
								<p className="mt-1 text-muted-foreground text-sm">
									{order.address || "Хаяг оруулаагүй"}
								</p>
							</div>
							<DeliveryZoneSelect
								id={`batch-order-${order.id}-delivery-zone`}
								label={`#${order.orderNumber} хүргэлтийн бүс`}
								zones={zones}
								value={draftZoneIds[order.id]}
								onValueChange={(addressZoneId) =>
									setDraftZoneIds((current) => ({
										...current,
										[order.id]: addressZoneId,
									}))
								}
								disabled={!zonesReady || isSending}
							/>
						</div>
					))}
				</div>

				<DialogFooter position="static" className="px-4 py-3 sm:px-6">
					<Button
						type="button"
						variant="outline"
						disabled={isSending}
						onClick={() => onOpenChange(false)}
					>
						Болих
					</Button>
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={() => void handleSubmit()}
					>
						{isSending ? (
							<Loader2
								className="mr-2 h-4 w-4 animate-spin"
								aria-hidden="true"
							/>
						) : null}
						{isSending ? "Илгээж байна..." : "TU руу илгээх"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
