import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { addSearch } from "@/lib/search-history";
import SearchInput from "./search-input";
import SearchResults from "./search-results";
import SearchSuggestions from "./search-suggestions";

const SearchOverlay: Component = () => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isSearching, setIsSearching] = createSignal(false);

	const handleSearch = (query: string) => {
		setSearchQuery(query);
		if (query.length >= 2) {
			// Add to search history when user searches
			addSearch(query);
		}
	};

	const handleSelectSuggestion = (term: string) => {
		setSearchQuery(term);
		handleSearch(term);
	};

	const handleClose = () => {
		setIsOpen(false);
		// Reset state after close animation
		setTimeout(() => {
			setSearchQuery("");
			setIsSearching(false);
		}, 300);
	};

	return (
		<Sheet open={isOpen()} onOpenChange={setIsOpen}>
			<SheetTrigger
				as="button"
				type="button"
				aria-label="Хайх"
				class="flex items-center justify-center border-[3px] border-black bg-white p-2 shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary hover:shadow-[1px_1px_0_0_rgba(0,0,0,1)]"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.3-4.3" />
				</svg>
			</SheetTrigger>

			<SheetContent
				position="top"
				class="h-[90vh] w-full max-w-none border-black border-b-4 p-0 sm:h-[85vh]"
			>
				<div class="flex h-full flex-col">
					{/* Header */}
					<div class="border-black border-b-3 bg-primary/10 px-4 py-4 sm:px-6">
						<SheetHeader class="mb-4">
							<SheetTitle class="flex items-center gap-2 font-black text-xl uppercase tracking-tight sm:text-2xl">
								<span>🔍</span>
								Бүтээгдэхүүн хайх
							</SheetTitle>
						</SheetHeader>

						{/* Search Input */}
						<SearchInput
							value={searchQuery()}
							onValueChange={setSearchQuery}
							onSearch={handleSearch}
							isLoading={isSearching() && searchQuery().length >= 2}
							autofocus
							placeholder="Витамин, нэмэлт тэжээл хайх..."
						/>
					</div>

					{/* Content Area */}
					<div class="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
						<Show
							when={searchQuery().length >= 2}
							fallback={
								<SearchSuggestions onSelectSearch={handleSelectSuggestion} />
							}
						>
							<SearchResults
								searchQuery={searchQuery()}
								onProductClick={handleClose}
								onLoadingChange={setIsSearching}
							/>
						</Show>
					</div>

					{/* Footer */}
					<div class="border-black border-t-3 bg-muted/50 px-4 py-3 sm:px-6">
						<div class="flex items-center justify-between">
							<p class="text-black/50 text-xs sm:text-sm">
								<kbd class="mr-1 rounded border border-black/20 bg-white px-1.5 py-0.5 font-mono text-xs">
									ESC
								</kbd>
								хаах
							</p>
							<p class="text-black/50 text-xs sm:text-sm">
								<kbd class="mr-1 rounded border border-black/20 bg-white px-1.5 py-0.5 font-mono text-xs">
									Enter
								</kbd>
								хайх
							</p>
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};

export default SearchOverlay;
