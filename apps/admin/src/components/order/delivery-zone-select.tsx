import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export interface DeliveryZone {
	Id: number;
	zoneName: string;
}

interface DeliveryZoneSelectProps {
	id: string;
	label: string;
	zones: DeliveryZone[];
	value?: number;
	onValueChange: (value: number) => void;
	disabled?: boolean;
}

export function DeliveryZoneSelect({
	id,
	label,
	zones,
	value,
	onValueChange,
	disabled,
}: DeliveryZoneSelectProps) {
	return (
		<div className="space-y-2">
			<label htmlFor={id} className="font-bold text-sm">
				{label}
			</label>
			<Select
				value={value?.toString()}
				onValueChange={(next) => onValueChange(Number(next))}
				disabled={disabled}
			>
				<SelectTrigger id={id} aria-required="true">
					<SelectValue placeholder="Хүргэлтийн бүс сонгох" />
				</SelectTrigger>
				<SelectContent>
					{zones.map((zone) => (
						<SelectItem key={zone.Id} value={zone.Id.toString()}>
							{zone.zoneName}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
