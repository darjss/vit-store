import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export interface DeliveryZone {
	id: number;
	zoneName: string;
}

interface DeliveryZoneSelectProps {
	disabled?: boolean;
	id: string;
	label: string;
	onValueChange: (value: number) => void;
	value?: number;
	zones: Array<DeliveryZone>;
}

export function DeliveryZoneSelect({
	disabled,
	id,
	label,
	onValueChange,
	value,
	zones,
}: DeliveryZoneSelectProps) {
	return (
		<div className="space-y-2">
			<label className="text-sm font-bold" htmlFor={id}>
				{label}
			</label>
			<Select
				disabled={disabled}
				onValueChange={(next) => onValueChange(Number(next))}
				value={value?.toString()}
			>
				<SelectTrigger aria-required="true" id={id}>
					<SelectValue placeholder="Хүргэлтийн бүс сонгох" />
				</SelectTrigger>
				<SelectContent>
					{zones.map((zone) => (
						<SelectItem key={zone.id} value={zone.id.toString()}>
							{zone.zoneName}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
