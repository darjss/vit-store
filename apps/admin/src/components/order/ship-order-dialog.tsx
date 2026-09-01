import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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

interface ShipOrderDialogProps {
	address: string;
	addressZoneId?: number;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	open: boolean;
	orderId: number;
	orderNumber: string;
}

export default function ShipOrderDialog({
	address,
	addressZoneId,
	onOpenChange,
	onSuccess,
	open,
	orderId,
	orderNumber,
}: ShipOrderDialogProps) {
	const [selectedZoneId, setSelectedZoneId] = useState<number>();
	const zonesQuery = useQuery({
		...trpc.order.getDeliveryAddressZones.queryOptions(),
		enabled: open,
		staleTime: 1000 * 60 * 60 * 24,
	});
	const shipOrder = useMutation(
		trpc.order.shipOrder.mutationOptions({
			onSuccess: () => {
				onOpenChange(false);
				onSuccess();
				toast.success("Захиалга TU руу илгээгдлээ");
			},
		}),
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		setSelectedZoneId(addressZoneId);
		shipOrder.reset();
	}, [open, addressZoneId, shipOrder.reset]);

	const zones = zonesQuery.data ?? [];
	const zonesReady = zonesQuery.isSuccess && zones.length > 0;
	const selectedZoneExists = zones.some((zone) => zone.id === selectedZoneId);
	const canSubmit = zonesReady && selectedZoneExists && !shipOrder.isPending;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="border-border bg-card shadow-hard max-h-[85vh] max-w-[95vw] overflow-y-auto border-2 sm:max-w-lg">
				<DialogHeader className="px-4 sm:px-6">
					<DialogTitle>Хүргэлтийн бүс сонгох</DialogTitle>
					<DialogDescription>#{orderNumber} захиалгыг TU руу илгээх</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 p-4 sm:p-6">
					<div className="border-border bg-muted flex gap-2 border-2 p-3 text-sm">
						<MapPin aria-hidden="true" className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
						<p>{address || "Хаяг оруулаагүй"}</p>
					</div>

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

					<DeliveryZoneSelect
						disabled={!zonesReady || shipOrder.isPending}
						id={`order-${orderId}-delivery-zone`}
						label="Хүргэлтийн бүс"
						onValueChange={setSelectedZoneId}
						value={selectedZoneId}
						zones={zones}
					/>

					{shipOrder.isError ? (
						<p className="text-destructive text-sm" role="alert">
							{shipOrder.error.message || "Захиалга илгээж чадсангүй."}
						</p>
					) : null}
				</div>

				<DialogFooter className="px-4 py-3 sm:px-6" position="static">
					<Button
						disabled={shipOrder.isPending}
						onClick={() => onOpenChange(false)}
						type="button"
						variant="outline"
					>
						Болих
					</Button>
					<Button
						disabled={!canSubmit}
						onClick={() => {
							if (!selectedZoneId) {
								return;
							}
							shipOrder.mutate({ addressZoneId: selectedZoneId, orderId });
						}}
						type="button"
					>
						{shipOrder.isPending ? (
							<Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
						) : null}
						{shipOrder.isPending ? "Илгээж байна..." : "TU руу илгээх"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
