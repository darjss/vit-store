import { navigate } from "astro:transitions/client";
import type { Component } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { addSearch } from "@/lib/search-history";
import IconSearch from "~icons/ri/search-line";
import SearchInput from "./search-input";
import SearchResults from "./search-results";
import SearchSuggestions from "./search-suggestions";

const SearchOverlay: Component = () => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isSearching, setIsSearching] = createSignal(false);

	// Close sheet on Astro View Transitions navigation
	onMount(() => {
		const handleNavigation = () => {
			setIsOpen(false);
		};
		document.addEventListener("astro:before-preparation", handleNavigation);
		onCleanup(() => {
			document.removeEventListener(
				"astro:before-preparation",
				handleNavigation,
			);
		});
	});

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

	const handleSubmitSearch = (query: string) => {
		const trimmedQuery = query.trim();
		if (trimmedQuery.length < 2) {
			return;
		}
		addSearch(trimmedQuery);
		setIsOpen(false);
		navigate(`/search/?q=${encodeURIComponent(trimmedQuery)}`);
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
				class="flex items-center justify-center border-3 border-border bg-background p-2 shadow-hard-sm transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary hover:shadow-none"
			>
				<IconSearch class="h-5 w-5" aria-hidden="true" />
			</SheetTrigger>

			<SheetContent
				position="top"
				class="h-[90vh] w-full max-w-none border-border border-b-4 p-0 sm:h-[85vh]"
			>
				<div class="flex h-full flex-col">
					{/* Header */}
					<div class="border-border border-b-3 bg-primary/10 px-4 py-4 sm:px-6">
						<SheetHeader class="mb-4">
							<SheetTitle class="flex items-center gap-2 font-black text-xl uppercase tracking-tight sm:text-2xl">
								<IconSearch class="h-6 w-6 text-primary" />
								Бүтээгдэхүүн хайх
							</SheetTitle>
						</SheetHeader>

						{/* Search Input */}
						<SearchInput
							value={searchQuery()}
							onValueChange={setSearchQuery}
							onSearch={handleSearch}
							onSubmitSearch={handleSubmitSearch}
							isLoading={isSearching() && searchQuery().length >= 2}
							autofocus
							focusKey={isOpen()}
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
					<div class="border-border border-t-3 bg-muted/50 px-4 py-3 sm:px-6">
						<div class="flex items-center justify-between">
							<p class="text-muted-foreground/80 text-xs sm:text-sm">
								<kbd class="mr-1 rounded border border-border/20 bg-background px-1.5 py-0.5 font-mono text-xs">
									ESC
								</kbd>
								хаах
							</p>
							<p class="text-muted-foreground/80 text-xs sm:text-sm">
								<kbd class="mr-1 rounded border border-border/20 bg-background px-1.5 py-0.5 font-mono text-xs">
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
