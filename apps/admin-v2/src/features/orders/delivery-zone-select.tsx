/*
 * Delivery zone select — shared by the single and batch ship dialogs.
 */
import {
	Select,
	SelectContent,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@vit/ui";

import type { DeliveryZone } from "./queries";

interface DeliveryZoneSelectProps {
	id: string;
	label: string;
	zones: DeliveryZone[];
	value?: number;
	onValueChange: (value: number) => void;
	disabled?: boolean;
}

export function DeliveryZoneSelect(props: DeliveryZoneSelectProps) {
	return (
		<Select
			options={props.zones}
			optionValue={(zone) => String(zone.Id)}
			optionTextValue={(zone) => zone.zoneName}
			itemComponent={(selectProps) => (
				<SelectItem item={selectProps.item}>
					{selectProps.item.rawValue.zoneName}
				</SelectItem>
			)}
			value={props.zones.find((zone) => zone.Id === props.value) ?? null}
			onChange={(zone) => {
				if (zone) props.onValueChange(zone.Id);
			}}
			placeholder="Хүргэлтийн бүс сонгох"
			disabled={props.disabled}
		>
			<SelectLabel>{props.label}</SelectLabel>
			<SelectTrigger>
				<SelectValue<DeliveryZone>>
					{(state) =>
						state.selectedOption()?.zoneName ?? "Хүргэлтийн бүс сонгох"
					}
				</SelectValue>
			</SelectTrigger>
			<SelectContent />
		</Select>
	);
}
