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
import IconSearch from "~icons/ri/search-line";
import IconClose from "~icons/ri/close-line";

interface SearchInputProps {
	value?: string;
	onValueChange?: (value: string) => void;
	onSearch?: (value: string) => void;
	placeholder?: string;
	isLoading?: boolean;
	debounceMs?: number;
	autofocus?: boolean;
	class?: string;
}

const SearchInput: Component<SearchInputProps> = (props) => {
	const [local, others] = splitProps(props, [
		"value",
		"onValueChange",
		"onSearch",
		"placeholder",
		"isLoading",
		"debounceMs",
		"autofocus",
		"class",
	]);

	const [inputValue, setInputValue] = createSignal(local.value ?? "");
	let inputRef: HTMLInputElement | undefined;
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

	const debounceMs = () => local.debounceMs ?? 300;

	// Sync internal state with external value prop
	createEffect(() => {
		if (local.value !== undefined && local.value !== inputValue()) {
			setInputValue(local.value);
		}
	});

	onMount(() => {
		if (local.autofocus && inputRef) {
			setTimeout(() => inputRef?.focus(), 100);
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
			local.onSearch?.(newValue);
		}, debounceMs());
	};

	const handleClear = () => {
		setInputValue("");
		local.onValueChange?.("");
		local.onSearch?.("");
		inputRef?.focus();
	};

	const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (
		e,
	) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (debounceTimeout) clearTimeout(debounceTimeout);
			local.onSearch?.(inputValue());
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
				<IconSearch class="h-5 w-5 text-black/60" aria-hidden="true" />
			</div>

			<TextFieldInput
				ref={inputRef}
				value={inputValue()}
				onInput={handleInput}
				onKeyDown={handleKeyDown}
				placeholder={local.placeholder ?? "Бүтээгдэхүүн хайх..."}
				type="search"
				class="h-14 pr-12 pl-12 text-lg placeholder:text-black/40 sm:h-16 sm:text-xl [&::-ms-clear]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
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
								class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-white transition-all hover:bg-primary active:scale-95"
								aria-label="Clear search"
							>
								<IconClose class="h-4 w-4" aria-hidden="true" />
							</button>
						</Show>
					}
				>
					<div class="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
				</Show>
			</div>
		</TextField>
	);
};

export default SearchInput;
