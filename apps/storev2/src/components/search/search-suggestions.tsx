import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	clearHistory,
	getRecentSearches,
	removeSearch,
	type SearchHistoryItem,
} from "@/lib/search-history";
import IconClose from "~icons/ri/close-line";
import IconFire from "~icons/ri/fire-fill";
import IconTime from "~icons/ri/time-line";

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
				<div>
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-black text-black/70 text-sm uppercase tracking-wider">
							<IconTime class="mr-2 inline-block h-4 w-4 text-blue-500" />
							Сүүлд хайсан
						</h3>
						<button
							type="button"
							onClick={handleClearAll}
							class="font-bold text-black/50 text-xs uppercase tracking-wide transition-colors hover:text-destructive"
						>
							Арилгах
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						<For each={recentSearches()}>
							{(item) => (
								<button
									type="button"
									onClick={() => props.onSelectSearch(item.term)}
									class="group flex items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 font-bold text-sm shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary hover:shadow-[1px_1px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
								>
									<span>{item.term}</span>
									<span
										onClick={(e) => handleRemoveSearch(item.term, e)}
										class="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-black/60 opacity-0 transition-all hover:bg-destructive hover:text-white group-hover:opacity-100"
									>
										<IconClose class="h-3 w-3" />
									</span>
								</button>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Trending Searches */}
			<div>
				<h3 class="mb-3 font-black text-black/70 text-sm uppercase tracking-wider">
					<IconFire class="mr-2 inline-block h-4 w-4 text-orange-500" />
					Түгээмэл хайлт
				</h3>
				<div class="flex flex-wrap gap-2">
					<For each={trendingSearches}>
						{(term) => (
							<button
								type="button"
								onClick={() => props.onSelectSearch(term)}
								class="rounded-full border-2 border-black bg-secondary px-4 py-2 font-bold text-secondary-foreground text-sm shadow-[2px_2px_0_0_#fff] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#fff] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
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
