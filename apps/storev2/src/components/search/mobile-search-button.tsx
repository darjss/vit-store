import type { Component } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
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
import IconSearch from "~icons/ri/search-line";

/**
 * Mobile-optimized search button that opens a full-screen search overlay.
 * Designed for the mobile bottom navigation bar.
 */
const MobileSearchButton: Component = () => {
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
					<IconSearch
						class="h-5 w-5 transition-transform duration-200 group-hover:scale-110"
						aria-hidden="true"
					/>
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
									<IconSearch class="h-5 w-5 text-primary" />
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
