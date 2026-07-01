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
						<h3 class="font-extrabold text-muted-foreground/70 text-sm uppercase tracking-wider">
							<IconTime class="mr-2 inline-block h-4 w-4 text-blue-500" />
							Сүүлд хайсан
						</h3>
						<button
							type="button"
							onClick={handleClearAll}
							class="font-bold text-muted-foreground/80 text-xs uppercase tracking-wide transition-colors hover:text-destructive"
						>
							Арилгах
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						<For each={recentSearches()}>
							{(item) => (
								<div class="group flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 font-bold text-sm shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-quart hover:bg-primary hover:shadow-soft active:scale-[0.97]">
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
										class="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground/80 opacity-0 transition-all hover:bg-destructive hover:text-white group-hover:opacity-100"
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
			<div>
				<h3 class="mb-3 font-extrabold text-muted-foreground/70 text-sm uppercase tracking-wider">
					<IconFire class="mr-2 inline-block h-4 w-4 text-orange-500" />
					Түгээмэл хайлт
				</h3>
				<div class="flex flex-wrap gap-2">
					<For each={trendingSearches}>
						{(term) => (
							<button
								type="button"
								onClick={() => props.onSelectSearch(term)}
								class="rounded-full border border-border bg-secondary px-4 py-2 font-bold text-secondary-foreground text-sm shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-quart hover:shadow-soft active:scale-[0.97]"
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
