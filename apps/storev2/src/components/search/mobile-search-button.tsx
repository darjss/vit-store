import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { addSearch } from "@/lib/search-history";
import SearchInput from "./search-input";
import SearchResults from "./search-results";
import SearchSuggestions from "./search-suggestions";

/**
 * Mobile-optimized search button that opens a full-screen search overlay.
 * Designed for the mobile bottom navigation bar.
 */
const MobileSearchButton: Component = () => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isSearching, setIsSearching] = createSignal(false);

	const handleSearch = (query: string) => {
		setSearchQuery(query);
		if (query.length >= 2) {
			addSearch(query);
		}
	};

	const handleSelectSuggestion = (term: string) => {
		setSearchQuery(term);
		handleSearch(term);
	};

	const handleClose = () => {
		setIsOpen(false);
		setTimeout(() => {
			setSearchQuery("");
			setIsSearching(false);
		}, 300);
	};

	return (
		<>
			{/* Trigger Button */}
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				class="group block w-full rounded-sm px-3 py-2 text-foreground/70 transition-colors duration-200 hover:bg-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				aria-label="Хайх"
			>
				<div class="flex flex-col items-center gap-1">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="transition-transform duration-200 group-hover:scale-110"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<p class="font-bold text-[11px] leading-none">Хайх</p>
				</div>
			</button>

			{/* Search Sheet */}
			<Sheet open={isOpen()} onOpenChange={setIsOpen}>
				<SheetContent
					position="bottom"
					class="h-[85vh] w-full max-w-none border-black border-t-4 p-0"
				>
					<div class="flex h-full flex-col">
						{/* Header */}
						<div class="border-black border-b-3 bg-primary/10 px-4 py-4">
							<SheetHeader class="mb-4">
								<SheetTitle class="flex items-center gap-2 font-black text-lg uppercase tracking-tight">
									<span>🔍</span>
									Бүтээгдэхүүн хайх
								</SheetTitle>
							</SheetHeader>

							<SearchInput
								value={searchQuery()}
								onValueChange={setSearchQuery}
								onSearch={handleSearch}
								isLoading={isSearching() && searchQuery().length >= 2}
								autofocus
								placeholder="Витамин, нэмэлт тэжээл..."
							/>
						</div>

						{/* Content */}
						<div class="flex-1 overflow-y-auto px-4 py-4">
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
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
};

export default MobileSearchButton;
