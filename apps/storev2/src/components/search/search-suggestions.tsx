import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import {
	clearHistory,
	getRecentSearches,
	removeSearch,
	type SearchHistoryItem,
} from "@/lib/search-history";
import {
	CloseCircleIcon as IconClose,
	ClockCircleIcon as IconTime,
} from "@solar-icons/solid/linear";
import { FireIcon as IconFire } from "@solar-icons/solid/bold";

interface SearchSuggestionsProps {
	onSelectSearch: (term: string) => void;
}

const SearchSuggestions: Component<SearchSuggestionsProps> = (props) => {
	const [recentSearches, setRecentSearches] = createSignal<Array<SearchHistoryItem>>([]);

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
	const trendingSearches = ["Vitamin D", "Omega 3", "Витамин C", "Магний", "Протеин", "Collagen"];

	return (
		<div class="space-y-6">
			{/* Recent Searches */}
			<Show when={recentSearches().length > 0}>
				<div class="enter-rise" style={{ "transition-duration": "250ms" }}>
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
							<IconTime class="text-muted-foreground mr-1.5 inline-block h-4 w-4" />
							Сүүлд хайсан
						</h3>
						<button
							class="text-muted-foreground/80 hover:text-foreground text-[11px] font-semibold tracking-wide uppercase transition-colors duration-150"
							onClick={handleClearAll}
							type="button"
						>
							Арилгах
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						<For each={recentSearches()}>
							{(item) => (
								<div class="group border-border bg-card text-foreground/80 shadow-soft-sm hover:shadow-soft flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]">
									<button
										class="min-w-0 flex-1 truncate text-left"
										onClick={() => props.onSelectSearch(item.term)}
										type="button"
									>
										{item.term}
									</button>
									<button
										aria-label={`${item.term} хайлтыг арилгах`}
										class="text-muted-foreground/60 hover:bg-muted hover:text-foreground ml-1 flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-150"
										onClick={(e) => handleRemoveSearch(item.term, e)}
										type="button"
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
			<div class="enter-rise stagger-2" style={{ "transition-duration": "250ms" }}>
				<h3 class="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wide uppercase">
					<IconFire class="text-muted-foreground mr-1.5 inline-block h-4 w-4" />
					Түгээмэл хайлт
				</h3>
				<div class="flex flex-wrap gap-2">
					<For each={trendingSearches}>
						{(term) => (
							<button
								class="border-border bg-muted text-foreground/80 shadow-soft-sm hover:shadow-soft min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
								onClick={() => props.onSelectSearch(term)}
								type="button"
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
