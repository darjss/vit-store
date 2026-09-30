import { For, Show } from "solid-js";
import { CloseCircleIcon as IconClose } from "@solar-icons/solid/linear";

type AppliedChip = {
	key: string;
	label: string;
	onRemove: () => void;
};

type AppliedFiltersProps = {
	chips: Array<AppliedChip>;
	onClearAll: () => void;
};

const AppliedFilters = (props: AppliedFiltersProps) => (
	<Show when={props.chips.length > 0}>
		<div class="mb-3 flex flex-wrap items-center gap-1.5">
			<For each={props.chips}>
				{(chip) => (
					<div class="border-border bg-primary/20 shadow-soft-sm flex h-8 items-center gap-1.5 rounded-full border pr-1.5 pl-3 text-xs font-semibold">
						<span class="max-w-[160px] truncate">{chip.label}</span>
						<button
							aria-label={`${chip.label} шүүлтүүр хасах`}
							class="border-border bg-card flex size-5 items-center justify-center rounded-full border transition-transform duration-200 ease-out active:scale-[0.97]"
							onClick={chip.onRemove}
							type="button"
						>
							<IconClose class="size-3" />
						</button>
					</div>
				)}
			</For>
			<button
				aria-label="Бүх шүүлтүүр цэвэрлэх"
				class="border-sale text-sale flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-transform duration-200 ease-out active:scale-[0.97]"
				onClick={props.onClearAll}
				type="button"
			>
				<IconClose class="size-3" />
				<span>Бүгдийг цэвэрлэх</span>
			</button>
		</div>
	</Show>
);

export default AppliedFilters;
