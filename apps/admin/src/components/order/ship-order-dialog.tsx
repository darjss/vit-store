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
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orderId: number;
	orderNumber: string;
	address: string;
	addressZoneId?: number;
	onSuccess: () => void;
}

export default function ShipOrderDialog({
	open,
	onOpenChange,
	orderId,
	orderNumber,
	address,
	addressZoneId,
	onSuccess,
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
		if (!open) return;
		setSelectedZoneId(addressZoneId);
		shipOrder.reset();
	}, [open, addressZoneId, shipOrder.reset]);

	const zones = zonesQuery.data ?? [];
	const zonesReady = zonesQuery.isSuccess && zones.length > 0;
	const selectedZoneExists = zones.some((zone) => zone.Id === selectedZoneId);
	const canSubmit = zonesReady && selectedZoneExists && !shipOrder.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] max-w-[95vw] overflow-y-auto border-2 border-border bg-card shadow-hard sm:max-w-lg">
				<DialogHeader className="px-4 sm:px-6">
					<DialogTitle>Хүргэлтийн бүс сонгох</DialogTitle>
					<DialogDescription>
						#{orderNumber} захиалгыг TU руу илгээх
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 p-4 sm:p-6">
					<div className="flex gap-2 border-2 border-border bg-muted p-3 text-sm">
						<MapPin
							className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<p>{address || "Хаяг оруулаагүй"}</p>
					</div>

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

					<DeliveryZoneSelect
						id={`order-${orderId}-delivery-zone`}
						label="Хүргэлтийн бүс"
						zones={zones}
						value={selectedZoneId}
						onValueChange={setSelectedZoneId}
						disabled={!zonesReady || shipOrder.isPending}
					/>

					{shipOrder.isError ? (
						<p className="text-destructive text-sm" role="alert">
							{shipOrder.error.message || "Захиалга илгээж чадсангүй."}
						</p>
					) : null}
				</div>

				<DialogFooter position="static" className="px-4 py-3 sm:px-6">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={shipOrder.isPending}
					>
						Болих
					</Button>
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={() => {
							if (!selectedZoneId) return;
							shipOrder.mutate({ orderId, addressZoneId: selectedZoneId });
						}}
					>
						{shipOrder.isPending ? (
							<Loader2
								className="mr-2 h-4 w-4 animate-spin"
								aria-hidden="true"
							/>
						) : null}
						{shipOrder.isPending ? "Илгээж байна..." : "TU руу илгээх"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
