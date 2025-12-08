import type { Component, JSX } from "solid-js";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { cn } from "@/lib/utils";

interface Category {
	id: number;
	name: string;
}

interface Brand {
	id: number;
	name: string;
}

interface FilterBarProps {
	searchTerm: string;
	sortField: string | null;
	sortDirection: string | null;
	categoryId: number | null;
	brandId: number | null;
	categories: Category[];
	brands: Brand[];
	onSearchChange: (term: string) => void;
	onSortChange: (field: string | null, direction: string | null) => void;
	onCategoryChange: (categoryId: number | null) => void;
	onBrandChange: (brandId: number | null) => void;
	onClearFilters: () => void;
	hasActiveFilters: boolean;
}

const sortOptions = [
	{ label: "Шинэ", field: "createdAt", direction: "desc" },
	{ label: "Хямд", field: "price", direction: "asc" },
	{ label: "Үнэтэй", field: "price", direction: "desc" },
];

const FilterBar: Component<FilterBarProps> = (props) => {
	const [inputValue, setInputValue] = createSignal(props.searchTerm);
	const [isSticky, setIsSticky] = createSignal(false);
	let sentinelRef: HTMLDivElement | undefined;
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

	onCleanup(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	// Sticky behavior
	onMount(() => {
		if (!sentinelRef) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsSticky(!entry.isIntersecting),
			{ threshold: 0, rootMargin: "-1px 0px 0px 0px" },
		);
		observer.observe(sentinelRef);
		onCleanup(() => observer.disconnect());
	});

	createEffect(() => setInputValue(props.searchTerm));

	const handleInputChange: JSX.EventHandler<HTMLInputElement, InputEvent> = (
		e,
	) => {
		const value = e.currentTarget.value;
		setInputValue(value);
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => props.onSearchChange(value), 400);
	};

	const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (
		e,
	) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (debounceTimeout) clearTimeout(debounceTimeout);
			props.onSearchChange(inputValue());
		}
		if (e.key === "Escape") {
			setInputValue("");
			props.onSearchChange("");
		}
	};

	const handleClearSearch = () => {
		setInputValue("");
		props.onSearchChange("");
	};

	const handleCategoryChange = (
		e: Event & { currentTarget: HTMLSelectElement },
	) => {
		const value = e.currentTarget.value;
		props.onCategoryChange(value ? Number.parseInt(value, 10) : null);
	};

	const handleBrandChange = (
		e: Event & { currentTarget: HTMLSelectElement },
	) => {
		const value = e.currentTarget.value;
		props.onBrandChange(value ? Number.parseInt(value, 10) : null);
	};

	return (
		<>
			<div ref={sentinelRef} class="h-0" />

			<div
				class={cn(
					"mb-3 transition-all duration-150 sm:mb-4",
					isSticky() &&
						"-mx-3 sm:-mx-6 sticky top-0 z-40 border-black border-b-3 bg-white/95 px-3 py-2.5 backdrop-blur-sm sm:border-b-4 sm:px-6 sm:py-3",
				)}
			>
				{/* All filters in one compact row */}
				<div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
					{/* Search - takes available space */}
					<div class="relative min-w-0 flex-1">
						<input
							type="text"
							value={inputValue()}
							onInput={handleInputChange}
							onKeyDown={handleKeyDown}
							placeholder="🔍 Хайх..."
							class="focus:-translate-x-px focus:-translate-y-px h-9 w-full min-w-[120px] border-2 border-black bg-white px-2.5 font-bold text-sm shadow-[2px_2px_0_0_#000] transition-all placeholder:text-black/40 focus:shadow-[3px_3px_0_0_#000] focus:outline-none sm:h-10 sm:border-3 sm:px-3 sm:text-base"
						/>
						<Show when={inputValue()}>
							<button
								type="button"
								onClick={handleClearSearch}
								class="absolute inset-y-0 right-0 flex items-center pr-2"
								aria-label="Clear"
							>
								<span class="flex h-5 w-5 items-center justify-center border border-black bg-white text-xs hover:bg-destructive hover:text-white">
									✕
								</span>
							</button>
						</Show>
					</div>

					{/* Category - compact pill select */}
					<div class="relative">
						<select
							value={props.categoryId?.toString() ?? ""}
							onChange={handleCategoryChange}
							class={cn(
								"h-9 cursor-pointer appearance-none border-2 border-black bg-white pr-6 pl-2 font-bold text-xs shadow-[2px_2px_0_0_#000] transition-all hover:bg-primary/20 focus:outline-none sm:h-10 sm:border-3 sm:pr-7 sm:pl-2.5 sm:text-sm",
								props.categoryId && "bg-primary/30",
							)}
						>
							<option value="">📁 Ангилал</option>
							<For each={props.categories}>
								{(cat) => <option value={cat.id.toString()}>{cat.name}</option>}
							</For>
						</select>
						<div class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
							<svg
								class="h-3 w-3"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								aria-hidden="true"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</div>
					</div>

					{/* Brand - compact pill select */}
					<div class="relative">
						<select
							value={props.brandId?.toString() ?? ""}
							onChange={handleBrandChange}
							class={cn(
								"h-9 cursor-pointer appearance-none border-2 border-black bg-white pr-6 pl-2 font-bold text-xs shadow-[2px_2px_0_0_#000] transition-all hover:bg-primary/20 focus:outline-none sm:h-10 sm:border-3 sm:pr-7 sm:pl-2.5 sm:text-sm",
								props.brandId && "bg-primary/30",
							)}
						>
							<option value="">🏷️ Брэнд</option>
							<For each={props.brands}>
								{(brand) => (
									<option value={brand.id.toString()}>{brand.name}</option>
								)}
							</For>
						</select>
						<div class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
							<svg
								class="h-3 w-3"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								aria-hidden="true"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</div>
					</div>

					{/* Sort - segmented button style */}
					<div class="flex border-2 border-black shadow-[2px_2px_0_0_#000] sm:border-3">
						<For each={sortOptions}>
							{(option, index) => (
								<button
									type="button"
									onClick={() => {
										if (
											props.sortField === option.field &&
											props.sortDirection === option.direction
										) {
											props.onSortChange(null, null);
										} else {
											props.onSortChange(option.field, option.direction);
										}
									}}
									class={cn(
										"h-9 px-2 font-bold text-[10px] uppercase tracking-wide transition-colors sm:h-10 sm:px-3 sm:text-xs",
										props.sortField === option.field &&
											props.sortDirection === option.direction
											? "bg-black text-white"
											: "bg-white hover:bg-primary/20",
										index() > 0 && "border-black border-l-2 sm:border-l-3",
									)}
								>
									{option.label}
								</button>
							)}
						</For>
					</div>

					{/* Clear all - only show when filters active */}
					<Show when={props.hasActiveFilters}>
						<button
							type="button"
							onClick={props.onClearFilters}
							class="flex h-9 items-center justify-center border-2 border-black bg-destructive px-2 font-bold text-[10px] text-white uppercase tracking-wide shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_0_#000] sm:h-10 sm:border-3 sm:px-3 sm:text-xs"
							aria-label="Clear all filters"
						>
							✕
						</button>
					</Show>
				</div>
			</div>
		</>
	);
};

export default FilterBar;
