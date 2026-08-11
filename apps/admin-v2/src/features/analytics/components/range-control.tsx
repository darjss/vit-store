/*
 * Segmented date-range control (daily / weekly / monthly) — variant-B pill
 * toggle. The value lives in the URL (`?range=...`) per the query-client
 * rules (URL search state for filters and date ranges), so the back button
 * and deep links keep working. APG segmented-control semantics: toggle
 * buttons with aria-pressed, one selected at a time.
 */
import { For } from "solid-js";

import { RANGE_OPTIONS } from "../labels";
import type { AnalyticsRange } from "../queries";

interface RangeControlProps {
	value: AnalyticsRange;
	onChange: (range: AnalyticsRange) => void;
}

export function RangeControl(props: RangeControlProps) {
	return (
		<fieldset class="grid w-full grid-cols-3 gap-1 rounded-ui border border-rule bg-surface p-1 shadow-card sm:w-auto">
			<legend class="sr-only">Хугацааны хүрээ</legend>
			<For each={RANGE_OPTIONS}>
				{(option) => {
					const selected = () => props.value === option.value;
					return (
						<button
							type="button"
							aria-pressed={selected()}
							onClick={() => props.onChange(option.value)}
							class={`h-11 rounded-lg px-4 font-bold text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
								selected()
									? "bg-ink text-canvas"
									: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink"
							}`}
						>
							{option.label}
						</button>
					);
				}}
			</For>
		</fieldset>
	);
}
