import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	clearHistory,
	getRecentSearches,
	removeSearch,
	type SearchHistoryItem,
} from "@/lib/search-history";
import { CloseCircleIcon as IconClose, ClockCircleIcon as IconTime } from "@solar-icons/solid/linear";
import { FireIcon as IconFire } from "@solar-icons/solid/bold";

interface SearchSuggestionsProps {
	onSelectSearch: (term: string) => void;
}

const SearchSuggestions: Component<SearchSuggestionsProps> = (props) => {
	const [recentSearches, setRecentSearches] = createSignal<SearchHistoryItem[]>(
		[],
	);

	onMount(() => {
		setRecentSearches(getRecentSearches());
	});

	const handleRemoveSearch = (term: string, e: Event) => {
		e.stopPropagation();
		removeSearch(term);
		setRecentSearches(getRecentSearches());
	};

	const handleClearAll = () => {
		clearHistory();
		setRecentSearches([]);
	};

	// Trending/popular searches (static for now, could be fetched from API)
	const trendingSearches = [
		"Vitamin D",
		"Omega 3",
		"Витамин C",
		"Магний",
		"Протеин",
		"Collagen",
	];

	return (
		<div class="space-y-6">
			{/* Recent Searches */}
			<Show when={recentSearches().length > 0}>
				<div class="enter-rise" style={{ "transition-duration": "250ms" }}>
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
							<IconTime class="mr-1.5 inline-block h-4 w-4 text-muted-foreground" />
							Сүүлд хайсан
						</h3>
						<button
							type="button"
							onClick={handleClearAll}
							class="font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wide transition-colors duration-150 hover:text-foreground"
						>
							Арилгах
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						<For each={recentSearches()}>
							{(item) => (
								<div class="group flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 font-medium text-foreground/80 text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]">
									<button
										type="button"
										onClick={() => props.onSelectSearch(item.term)}
										class="min-w-0 flex-1 truncate text-left"
									>
										{item.term}
									</button>
									<button
										type="button"
										onClick={(e) => handleRemoveSearch(item.term, e)}
										class="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors duration-150 hover:bg-muted hover:text-foreground"
										aria-label={`${item.term} хайлтыг арилгах`}
									>
										<IconClose class="h-3 w-3" />
									</button>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Trending Searches */}
			<div
				class="enter-rise stagger-2"
				style={{ "transition-duration": "250ms" }}
			>
				<h3 class="mb-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
					<IconFire class="mr-1.5 inline-block h-4 w-4 text-muted-foreground" />
					Түгээмэл хайлт
				</h3>
				<div class="flex flex-wrap gap-2">
					<For each={trendingSearches}>
						{(term) => (
							<button
								type="button"
								onClick={() => props.onSelectSearch(term)}
								class="min-h-11 rounded-full border border-border bg-muted px-4 py-2 font-medium text-foreground/80 text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
							>
								{term}
							</button>
						)}
					</For>
				</div>
			</div>
		</div>
	);
};

export default SearchSuggestions;
