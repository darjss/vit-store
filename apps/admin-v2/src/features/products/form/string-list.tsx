import { Button, Input } from "@vit/ui";
import { createSignal, For, Show } from "solid-js";

interface StringListFieldProps {
	label: string;
	placeholder: string;
	values: string[];
	suggestions?: string[];
	onAdd: (value: string) => void;
	onRemove: (index: number) => void;
}

const MAX_SUGGESTIONS = 6;

/** Chip list input for ingredients/tags: type + Enter to add, tap to remove. */
export function StringListField(props: StringListFieldProps) {
	const [input, setInput] = createSignal("");

	const add = () => {
		const value = input().trim();
		if (!value) return;
		props.onAdd(value);
		setInput("");
	};

	const visibleSuggestions = () => {
		const query = input().trim().toLocaleLowerCase();
		if (!query) return [];
		return (props.suggestions ?? [])
			.filter((suggestion) => suggestion.toLocaleLowerCase().startsWith(query))
			.slice(0, MAX_SUGGESTIONS);
	};

	return (
		<div class="space-y-2">
			<div class="flex gap-2">
				<Input
					value={input()}
					onInput={(event) => setInput(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							add();
						}
					}}
					placeholder={props.placeholder}
					aria-label={props.label}
					class="min-w-0 flex-1"
				/>
				<Button type="button" size="compact" variant="secondary" onClick={add}>
					Нэмэх
				</Button>
			</div>

			<Show when={props.values.length > 0}>
				<ul class="flex flex-wrap gap-1.5">
					<For each={props.values}>
						{(value, index) => (
							<li class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-[13px] text-ink">
								{value}
								<button
									type="button"
									aria-label={`${value} — устгах`}
									onClick={() => props.onRemove(index())}
									class="grid size-5 place-items-center rounded-full text-ink-2 transition-colors hover:bg-rule hover:text-ink"
								>
									×
								</button>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<Show when={visibleSuggestions().length > 0}>
				<div class="flex flex-wrap gap-1.5">
					<For each={visibleSuggestions()}>
						{(suggestion) => (
							<button
								type="button"
								onClick={() => props.onAdd(suggestion)}
								class="rounded-full border border-rule px-2.5 py-1 font-semibold text-ink-2 text-xs transition-colors hover:border-ink-2 hover:text-ink"
							>
								{suggestion}
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
