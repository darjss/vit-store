import type { Component, JSX } from "solid-js";
import {
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	Show,
	splitProps,
} from "solid-js";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";
import { CloseCircleIcon as IconClose, MinimalisticMagnifierIcon as IconSearch } from "@solar-icons/solid/linear";

interface SearchInputProps {
	value?: string;
	onValueChange?: (value: string) => void;
	onSearch?: (value: string) => void;
	onSubmitSearch?: (value: string) => void;
	placeholder?: string;
	isLoading?: boolean;
	debounceMs?: number;
	autofocus?: boolean;
	focusKey?: unknown;
	class?: string;
}

const SearchInput: Component<SearchInputProps> = (props) => {
	const [local, others] = splitProps(props, [
		"value",
		"onValueChange",
		"onSearch",
		"onSubmitSearch",
		"placeholder",
		"isLoading",
		"debounceMs",
		"autofocus",
		"focusKey",
		"class",
	]);

	const [inputValue, setInputValue] = createSignal(local.value ?? "");
	let inputRef: HTMLInputElement | undefined;
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
	// Track last prop we applied so external updates (suggestions, URL, clear)
	// still win, without treating local keystrokes as a stale prop and
	// snapping the field back to the debounced parent value.
	let lastSyncedValue = local.value ?? "";

	const debounceMs = () => local.debounceMs ?? 300;

	createEffect(() => {
		const next = local.value;
		if (next === undefined || next === lastSyncedValue) {
			return;
		}
		lastSyncedValue = next;
		setInputValue(next);
	});

	const focusInput = () => {
		if (!local.autofocus || !inputRef) {
			return;
		}

		inputRef.focus();
		requestAnimationFrame(() => inputRef?.focus());
	};

	onMount(focusInput);

	createEffect(() => {
		if (local.focusKey) {
			focusInput();
		}
	});

	onCleanup(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	const handleInput: JSX.EventHandler<HTMLInputElement, InputEvent> = (e) => {
		const newValue = e.currentTarget.value;
		setInputValue(newValue);
		local.onValueChange?.(newValue);

		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			lastSyncedValue = newValue;
			local.onSearch?.(newValue);
		}, debounceMs());
	};

	const handleClear = () => {
		lastSyncedValue = "";
		setInputValue("");
		local.onValueChange?.("");
		local.onSearch?.("");
		inputRef?.focus();
	};

	const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (
		e,
	) => {
		// Enter = explicit submit. Cancels any pending debounce, syncs the
		// value, and fires onSubmitSearch (full-page navigation) if provided,
		// else falls back to onSearch (live results). This is the deliberate
		// "user pressed Enter" path — distinct from the debounced onSearch
		// that fires on each keystroke.
		if (e.key === "Enter") {
			e.preventDefault();
			if (debounceTimeout) clearTimeout(debounceTimeout);
			const submittedValue = e.currentTarget.value;
			lastSyncedValue = submittedValue;
			setInputValue(submittedValue);
			local.onValueChange?.(submittedValue);
			local.onSubmitSearch?.(submittedValue);
			if (!local.onSubmitSearch) {
				local.onSearch?.(submittedValue);
			}
			// Blur input on mobile after search to hide keyboard
			inputRef?.blur();
		}
		if (e.key === "Escape") {
			handleClear();
		}
	};

	return (
		<TextField class={cn("relative w-full flex-row gap-0", local.class)}>
			{/* Search Icon */}
			<div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4">
				<IconSearch
					class="h-5 w-5 text-muted-foreground/80"
					aria-hidden="true"
				/>
			</div>

			<TextFieldInput
				ref={inputRef}
				value={inputValue()}
				onInput={handleInput}
				onKeyDown={handleKeyDown}
				placeholder={local.placeholder ?? "Бүтээгдэхүүн хайх..."}
				type="search"
				class="h-14 pr-12 pl-12 text-lg placeholder:text-muted-foreground/40 sm:h-16 sm:text-xl [&::-ms-clear]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
				{...others}
			/>

			{/* Loading Spinner / Clear Button */}
			<div class="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-4">
				<Show
					when={local.isLoading}
					fallback={
						<Show when={inputValue()}>
							<button
								type="button"
								onClick={handleClear}
								class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background transition-all duration-200 ease-out-quart hover:bg-primary active:scale-[0.97]"
								aria-label="Clear search"
							>
								<IconClose class="h-4 w-4" aria-hidden="true" />
							</button>
						</Show>
					}
				>
					<div class="h-5 w-5 animate-spin rounded-full border border-border/20 border-t-black" />
				</Show>
			</div>
		</TextField>
	);
};

export default SearchInput;
