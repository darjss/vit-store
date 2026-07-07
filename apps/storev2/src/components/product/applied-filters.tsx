import { For, Show } from "solid-js";
import IconClose from "~icons/ri/close-line";

type AppliedChip = {
	key: string;
	label: string;
	onRemove: () => void;
};

type AppliedFiltersProps = {
	chips: AppliedChip[];
	onClearAll: () => void;
};

const AppliedFilters = (props: AppliedFiltersProps) => (
	<Show when={props.chips.length > 0}>
		<div class="mb-3 flex flex-wrap items-center gap-1.5">
			<For each={props.chips}>
				{(chip) => (
					<div class="flex h-8 items-center gap-1.5 rounded-full border border-border bg-primary/20 pr-1.5 pl-3 font-semibold text-xs shadow-soft-sm">
						<span class="max-w-[160px] truncate">{chip.label}</span>
						<button
							type="button"
							onClick={chip.onRemove}
							aria-label={`${chip.label} шүүлтүүр хасах`}
							class="flex size-5 items-center justify-center rounded-full border border-border bg-card transition-transform duration-200 ease-out active:scale-[0.97]"
						>
							<IconClose class="size-3" />
						</button>
					</div>
				)}
			</For>
			<button
				type="button"
				onClick={props.onClearAll}
				aria-label="Бүх шүүлтүүр цэвэрлэх"
				class="flex h-8 items-center gap-1.5 rounded-full border border-sale px-3 font-semibold text-sale text-xs transition-transform duration-200 ease-out active:scale-[0.97]"
			>
				<IconClose class="size-3" />
				<span>Бүгдийг цэвэрлэх</span>
			</button>
		</div>
	</Show>
);

export default AppliedFilters;
