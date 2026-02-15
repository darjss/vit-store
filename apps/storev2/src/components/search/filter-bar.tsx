import type { Component, JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { addSearch, getRecentSearches } from "@/lib/search-history";
import { cn } from "@/lib/utils";
import IconClose from "~icons/ri/close-line";
import IconFolder from "~icons/ri/folder-line";
import IconPriceTag from "~icons/ri/price-tag-3-line";
import IconSearch from "~icons/ri/search-line";

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
	presetFilter: "featured" | "recent" | "discount" | null;
	categories: Category[];
	brands: Brand[];
	onSearchChange: (term: string) => void;
	onSortChange: (field: string | null, direction: string | null) => void;
	onCategoryChange: (categoryId: number | null) => void;
	onBrandChange: (brandId: number | null) => void;
	onPresetFilterChange: (
		value: "featured" | "recent" | "discount" | null,
	) => void;
	onClearFilters: () => void;
	hasActiveFilters: boolean;
}

const presetFilterLabels: Record<"featured" | "recent" | "discount", string> = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
	discount: "Хямдралтай",
};

const sortOptions = [
	{ label: "Шинэ", field: "createdAt", direction: "desc" },
	{ label: "Хямд", field: "price", direction: "asc" },
	{ label: "Үнэтэй", field: "price", direction: "desc" },
];

type FilterOption = { label: string; value: string };

const FilterBar: Component<FilterBarProps> = (props) => {
	const [inputValue, setInputValue] = createSignal(props.searchTerm);
	const [isSticky, setIsSticky] = createSignal(false);
	const [isSearchDropdownOpen, setIsSearchDropdownOpen] = createSignal(false);
	const [recentSearches, setRecentSearches] = createSignal(getRecentSearches());
	let sentinelRef: HTMLDivElement | undefined;
	let searchDropdownRef: HTMLDivElement | undefined;
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

	onCleanup(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	// Trending searches
	const trendingSearches = [
		"Vitamin D",
		"Omega 3",
		"Витамин C",
		"Магний",
		"Протеин",
		"Collagen",
	];

	// Filter suggestions based on input
	const searchSuggestions = createMemo(() => {
		const term = inputValue().toLowerCase();
		if (!term) {
			return {
				recent: recentSearches().slice(0, 3),
				trending: trendingSearches.slice(0, 3),
			};
		}
		const filteredRecent = recentSearches().filter((item) =>
			item.term.toLowerCase().includes(term),
		);
		const filteredTrending = trendingSearches.filter((search) =>
			search.toLowerCase().includes(term),
		);
		return {
			recent: filteredRecent.slice(0, 3),
			trending: filteredTrending.slice(0, 3),
		};
	});

	// Get active category name
	const activeCategoryName = createMemo(() => {
		if (!props.categoryId) return null;
		return (
			props.categories.find((c) => c.id === props.categoryId)?.name ?? null
		);
	});

	// Get active brand name
	const activeBrandName = createMemo(() => {
		if (!props.brandId) return null;
		return props.brands.find((b) => b.id === props.brandId)?.name ?? null;
	});

	const activePresetFilterLabel = createMemo(() => {
		if (!props.presetFilter) return null;
		return presetFilterLabels[props.presetFilter];
	});

	const categoryOptions = createMemo<FilterOption[]>(() => [
		{ label: "Бүх ангилал", value: "all" },
		...props.categories.map((cat) => ({
			label: cat.name,
			value: cat.id.toString(),
		})),
	]);

	const brandOptions = createMemo<FilterOption[]>(() => [
		{ label: "Бүх брэнд", value: "all" },
		...props.brands.map((brand) => ({
			label: brand.name,
			value: brand.id.toString(),
		})),
	]);

	// Close dropdowns when clicking outside
	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				searchDropdownRef &&
				!searchDropdownRef.contains(event.target as Node)
			) {
				setIsSearchDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		onCleanup(() => {
			document.removeEventListener("mousedown", handleClickOutside);
		});
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
		setIsSearchDropdownOpen(value.length > 0 || true); // Show dropdown when typing or focused
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			props.onSearchChange(value);
			if (value.trim()) {
				addSearch(value.trim());
				setRecentSearches(getRecentSearches());
			}
		}, 400);
	};

	const handleSearchFocus = () => {
		setIsSearchDropdownOpen(true);
	};

	const handleSelectSuggestion = (term: string) => {
		setInputValue(term);
		props.onSearchChange(term);
		addSearch(term);
		setRecentSearches(getRecentSearches());
		setIsSearchDropdownOpen(false);
	};

	const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (
		e,
	) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (debounceTimeout) clearTimeout(debounceTimeout);
			props.onSearchChange(inputValue());
			setIsSearchDropdownOpen(false);
			// Blur input to dismiss mobile keyboard
			e.currentTarget.blur();
		}
		if (e.key === "Escape") {
			setInputValue("");
			props.onSearchChange("");
			setIsSearchDropdownOpen(false);
			e.currentTarget.blur();
		}
	};

	const handleClearSearch = () => {
		setInputValue("");
		props.onSearchChange("");
		setIsSearchDropdownOpen(false);
	};

	return (
		<>
			<div ref={sentinelRef} class="h-0" />

			<div
				class={cn(
					"mb-2 transition-all duration-150 sm:mb-3 lg:mb-4",
					isSticky() &&
						"-mx-2 sm:-mx-3 lg:-mx-6 sticky top-0 z-40 border-black border-b-2 bg-white/95 px-2 py-2 backdrop-blur-sm sm:border-b-3 sm:px-3 sm:py-2.5 lg:border-b-4 lg:px-6 lg:py-3",
				)}
			>
				{/* Active Filter Chips */}
				<Show when={props.hasActiveFilters}>
					<div class="mb-1.5 flex flex-wrap items-center gap-1 sm:mb-2 lg:mb-2.5">
						<Show when={props.searchTerm}>
							<div class="flex items-center gap-1 border-2 border-black bg-primary/20 px-2 py-0.5 font-bold text-[10px] uppercase shadow-[2px_2px_0_0_#000] sm:px-2.5 sm:text-xs">
								<IconSearch class="h-4 w-4" />
								<span class="max-w-[120px] truncate sm:max-w-[200px]">
									{props.searchTerm}
								</span>
								<button
									type="button"
									onClick={() => props.onSearchChange("")}
									class="ml-1 flex items-center hover:opacity-70"
									aria-label="Remove search filter"
								>
									<IconClose class="h-3 w-3" />
								</button>
							</div>
						</Show>
						<Show when={activeCategoryName()}>
							<div class="flex items-center gap-1 border-2 border-black bg-primary/20 px-2 py-0.5 font-bold text-[10px] uppercase shadow-[2px_2px_0_0_#000] sm:px-2.5 sm:text-xs">
								<IconFolder class="h-4 w-4" />
								<span class="max-w-[100px] truncate sm:max-w-[150px]">
									{activeCategoryName()}
								</span>
								<button
									type="button"
									onClick={() => props.onCategoryChange(null)}
									class="ml-1 flex items-center hover:opacity-70"
									aria-label="Remove category filter"
								>
									<IconClose class="h-3 w-3" />
								</button>
							</div>
						</Show>
						<Show when={activeBrandName()}>
							<div class="flex items-center gap-1 border-2 border-black bg-primary/20 px-2 py-0.5 font-bold text-[10px] uppercase shadow-[2px_2px_0_0_#000] sm:px-2.5 sm:text-xs">
								<IconPriceTag class="h-4 w-4" />
								<span class="max-w-[100px] truncate sm:max-w-[150px]">
									{activeBrandName()}
								</span>
								<button
									type="button"
									onClick={() => props.onBrandChange(null)}
									class="ml-1 flex items-center hover:opacity-70"
									aria-label="Remove brand filter"
								>
									<IconClose class="h-3 w-3" />
								</button>
							</div>
						</Show>
						<Show when={activePresetFilterLabel()}>
							<div class="flex items-center gap-1 border-2 border-black bg-primary/20 px-2 py-0.5 font-bold text-[10px] uppercase shadow-[2px_2px_0_0_#000] sm:px-2.5 sm:text-xs">
								<IconPriceTag class="h-4 w-4" />
								<span>{activePresetFilterLabel()}</span>
								<button
									type="button"
									onClick={() => props.onPresetFilterChange(null)}
									class="ml-1 flex items-center hover:opacity-70"
									aria-label="Remove preset filter"
								>
									<IconClose class="h-3 w-3" />
								</button>
							</div>
						</Show>
						<Show
							when={
								props.sortField &&
								props.sortDirection &&
								(props.sortField !== "createdAt" ||
									props.sortDirection !== "desc")
							}
						>
							<div class="flex items-center gap-1 border-2 border-black bg-primary/20 px-2 py-0.5 font-bold text-[10px] uppercase shadow-[2px_2px_0_0_#000] sm:px-2.5 sm:text-xs">
								<span>
									{sortOptions.find(
										(o) =>
											o.field === props.sortField &&
											o.direction === props.sortDirection,
									)?.label ?? "Эрэмбэлэх"}
								</span>
								<button
									type="button"
									onClick={() => props.onSortChange(null, null)}
									class="ml-1 flex items-center hover:opacity-70"
									aria-label="Remove sort filter"
								>
									<IconClose class="h-3 w-3" />
								</button>
							</div>
						</Show>
					</div>
				</Show>

				{/* All filters in one compact row */}
				<div class="flex flex-wrap items-center gap-1 sm:gap-1.5 lg:gap-2">
					{/* Search - takes available space */}
					<div
						class="relative min-w-0 flex-1 basis-full sm:basis-auto"
						ref={searchDropdownRef}
					>
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-black/40 sm:pl-2.5 lg:pl-3">
							<IconSearch class="h-4 w-4" />
						</div>
						<input
							type="text"
							value={inputValue()}
							onInput={handleInputChange}
							onKeyDown={handleKeyDown}
							onFocus={handleSearchFocus}
							placeholder="Хайх..."
							aria-label="Search products"
							aria-autocomplete="list"
							role="combobox"
							aria-expanded={isSearchDropdownOpen()}
							class="focus:-translate-x-px focus:-translate-y-px h-8 w-full min-w-0 border-2 border-black bg-white pr-7 pl-7 font-bold text-xs shadow-[2px_2px_0_0_#000] transition-all placeholder:text-black/40 focus:shadow-[3px_3px_0_0_#000] focus:outline-none sm:h-9 sm:pr-8 sm:pl-8 sm:text-sm lg:h-10 lg:border-3 lg:pr-10 lg:pl-10 lg:text-base"
						/>
						<Show when={inputValue()}>
							<button
								type="button"
								onClick={handleClearSearch}
								class="absolute inset-y-0 right-0 flex items-center pr-1.5 hover:opacity-70 sm:pr-2 lg:pr-2.5"
								aria-label="Clear search"
							>
								<div class="flex h-4 w-4 items-center justify-center border border-black bg-white hover:bg-destructive hover:text-white sm:h-5 sm:w-5">
									<IconClose class="h-3 w-3" />
								</div>
							</button>
						</Show>
						{/* Search Autocomplete Dropdown */}
						<Show
							when={
								isSearchDropdownOpen() &&
								(searchSuggestions().recent.length > 0 ||
									searchSuggestions().trending.length > 0)
							}
						>
							<div class="absolute top-full z-50 mt-1 w-full border-2 border-black bg-white shadow-[4px_4px_0_0_#000]">
								<div class="max-h-64 overflow-y-auto">
									<Show when={searchSuggestions().recent.length > 0}>
										<div class="border-black border-b px-2 py-1.5">
											<p class="font-bold text-[10px] text-black/50 uppercase">
												Сүүлд хайсан
											</p>
										</div>
										<For each={searchSuggestions().recent}>
											{(item) => (
												<button
													type="button"
													onClick={() => handleSelectSuggestion(item.term)}
													class="w-full px-3 py-2 text-left text-xs hover:bg-primary/20"
												>
													{item.term}
												</button>
											)}
										</For>
									</Show>
									<Show when={searchSuggestions().trending.length > 0}>
										<div class="border-black border-b px-2 py-1.5">
											<p class="font-bold text-[10px] text-black/50 uppercase">
												Түгээмэл хайлт
											</p>
										</div>
										<For each={searchSuggestions().trending}>
											{(term) => (
												<button
													type="button"
													onClick={() => handleSelectSuggestion(term)}
													class="w-full px-3 py-2 text-left text-xs hover:bg-primary/20"
												>
													{term}
												</button>
											)}
										</For>
									</Show>
								</div>
							</div>
						</Show>
					</div>

					{/* Category - compact Select */}
					<Select
						options={categoryOptions()}
						optionValue="value"
						optionTextValue="label"
						value={
							categoryOptions().find(
								(option) =>
									option.value === (props.categoryId?.toString() ?? "all"),
							) ?? null
						}
						placeholder="Ангилал"
						onChange={(option) =>
							props.onCategoryChange(
								!option || option.value === "all"
									? null
									: Number.parseInt(option.value, 10),
							)
						}
						itemComponent={(itemProps) => (
							<SelectItem
								item={itemProps.item}
								class="w-full px-3 py-2 text-left text-xs hover:bg-primary/20 data-selected:bg-primary/10 data-selected:font-bold"
							>
								{itemProps.item.rawValue.label}
							</SelectItem>
						)}
					>
						<SelectTrigger
							aria-label="Filter by category"
							class={cn(
								"relative h-8 min-w-[110px] cursor-pointer border-2 border-black bg-white pr-5 pl-7 font-bold text-[10px] shadow-[2px_2px_0_0_#000] transition-all hover:bg-primary/20 focus:outline-none sm:h-9 sm:pr-6 sm:pl-8 sm:text-xs lg:h-10 lg:border-3 lg:pr-7 lg:pl-9 lg:text-sm",
								props.categoryId && "bg-primary/30",
							)}
						>
							<div class="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-black/40 sm:left-2">
								<IconFolder class="h-4 w-4" />
							</div>
							<span class="max-w-[80px] truncate sm:max-w-[100px] lg:max-w-[140px]">
								{activeCategoryName() ?? "Ангилал"}
							</span>
						</SelectTrigger>
						<SelectContent class="max-h-60 overflow-y-auto border-2 border-black bg-white shadow-[4px_4px_0_0_#000]" />
					</Select>

					{/* Brand - Select */}
					<Select
						options={brandOptions()}
						optionValue="value"
						optionTextValue="label"
						value={
							brandOptions().find(
								(option) =>
									option.value === (props.brandId?.toString() ?? "all"),
							) ?? null
						}
						placeholder="Брэнд"
						onChange={(option) =>
							props.onBrandChange(
								!option || option.value === "all"
									? null
									: Number.parseInt(option.value, 10),
							)
						}
						itemComponent={(itemProps) => (
							<SelectItem
								item={itemProps.item}
								class="w-full px-3 py-2 text-left text-xs hover:bg-primary/20 data-selected:bg-primary/10 data-selected:font-bold"
							>
								{itemProps.item.rawValue.label}
							</SelectItem>
						)}
					>
						<SelectTrigger
							aria-label="Filter by brand"
							class={cn(
								"relative h-8 min-w-[110px] cursor-pointer border-2 border-black bg-white pr-5 pl-6 font-bold text-[10px] shadow-[2px_2px_0_0_#000] transition-all hover:bg-primary/20 focus:outline-none sm:h-9 sm:pr-6 sm:pl-7 sm:text-xs lg:h-10 lg:border-3 lg:pr-7 lg:pl-8 lg:text-sm",
								props.brandId && "bg-primary/30",
							)}
						>
							<div class="pointer-events-none absolute inset-y-0 left-1 flex items-center text-black/40 sm:left-1.5">
								<IconPriceTag class="h-4 w-4" />
							</div>
							<span class="max-w-[60px] truncate sm:max-w-[80px] lg:max-w-[120px]">
								{activeBrandName() ?? "Брэнд"}
							</span>
						</SelectTrigger>
						<SelectContent class="max-h-60 overflow-y-auto border-2 border-black bg-white shadow-[4px_4px_0_0_#000]" />
					</Select>

					{/* Sort - segmented button style */}
					<div class="flex border-2 border-black shadow-[2px_2px_0_0_#000] lg:border-3">
						<For each={sortOptions}>
							{(option, index) => {
								const isActive =
									props.sortField === option.field &&
									props.sortDirection === option.direction;
								return (
									<button
										type="button"
										onClick={() => {
											if (isActive) {
												props.onSortChange(null, null);
											} else {
												props.onSortChange(option.field, option.direction);
											}
										}}
										aria-label={`Sort by ${option.label}`}
										aria-pressed={isActive}
										class={cn(
											"relative h-8 px-1.5 font-bold text-[9px] uppercase tracking-wide transition-all sm:h-9 sm:px-2 sm:text-[10px] lg:h-10 lg:px-3 lg:text-xs",
											isActive
												? "bg-black text-white shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.2)]"
												: "bg-white hover:bg-primary/20",
											index() > 0 && "border-black border-l-2 lg:border-l-3",
										)}
									>
										{option.label}
										<Show when={isActive}>
											<span class="-right-0.5 -top-0.5 absolute flex h-1.5 w-1.5 items-center justify-center rounded-full bg-white text-[5px] text-black sm:h-2 sm:w-2 sm:text-[6px] lg:h-2.5 lg:w-2.5">
												●
											</span>
										</Show>
									</button>
								);
							}}
						</For>
					</div>

					{/* Clear all - only show when filters active */}
					<Show when={props.hasActiveFilters}>
						<button
							type="button"
							onClick={props.onClearFilters}
							class="flex h-8 items-center justify-center gap-0.5 border-2 border-black bg-destructive px-1.5 font-bold text-[9px] text-white uppercase tracking-wide shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_0_#000] sm:h-9 sm:gap-1 sm:px-2 sm:text-[10px] lg:h-10 lg:border-3 lg:px-3 lg:text-xs"
							aria-label="Clear all filters"
						>
							<IconClose class="h-3 w-3" />
							<span class="hidden sm:inline">Цэвэрлэх</span>
						</button>
					</Show>
				</div>
			</div>
		</>
	);
};

export default FilterBar;
