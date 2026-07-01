import { navigate } from "astro:transitions/client";
import type { Component } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { addSearch } from "@/lib/search-history";
import IconSearch from "~icons/ri/search-line";
import SearchInput from "./search-input";
import SearchResults from "./search-results";
import SearchSuggestions from "./search-suggestions";

/**
 * Full-page search experience for `/search/?q=...`.
 * Reads the initial query from the URL, keeps the `q` param in sync on
 * submit, and reuses the same SearchResults component as the overlay.
 */
const SearchPage: Component = () => {
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isSearching, setIsSearching] = createSignal(false);

	const readQueryFromUrl = () => {
		if (typeof window === "undefined") return "";
		return new URL(window.location.href).searchParams.get("q") ?? "";
	};

	onMount(() => {
		const initial = readQueryFromUrl();
		if (initial) {
			setSearchQuery(initial);
		}

		// Keep the signal in sync when Astro View Transitions navigate
		// back to /search/?q=... (e.g. browser back/forward).
		const handleNavigation = () => {
			const q = readQueryFromUrl();
			setSearchQuery(q);
		};
		document.addEventListener("astro:after-swap", handleNavigation);
		onCleanup(() => {
			document.removeEventListener("astro:after-swap", handleNavigation);
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

	const handleSubmitSearch = (query: string) => {
		const trimmedQuery = query.trim();
		if (trimmedQuery.length < 2) {
			return;
		}
		addSearch(trimmedQuery);
		setSearchQuery(trimmedQuery);
		// Update the URL so the page is shareable/bookmarkable and the
		// back button works. Same-path navigation swaps in place.
		navigate(`/search/?q=${encodeURIComponent(trimmedQuery)}`, {
			history: "replace",
		});
	};

	return (
		<div class="flex flex-col">
			{/* Header */}
			<div class="border-border border-b bg-primary/10 px-4 py-4 sm:px-6 sm:py-6">
				<div class="mx-auto max-w-screen-2xl">
					<h1 class="mb-4 flex items-center gap-2 font-extrabold text-xl uppercase tracking-tight sm:text-2xl">
						<IconSearch class="h-6 w-6 text-primary" />
						Бүтээгдэхүүн хайх
					</h1>
					<SearchInput
						value={searchQuery()}
						onValueChange={setSearchQuery}
						onSearch={handleSearch}
						onSubmitSearch={handleSubmitSearch}
						isLoading={isSearching() && searchQuery().length >= 2}
						autofocus
						placeholder="Витамин, нэмэлт тэжээл хайх..."
					/>
				</div>
			</div>

			{/* Content */}
			<div class="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
				<Show
					when={searchQuery().length >= 2}
					fallback={
						<SearchSuggestions onSelectSearch={handleSelectSuggestion} />
					}
				>
					<SearchResults
						searchQuery={searchQuery()}
						onLoadingChange={setIsSearching}
					/>
				</Show>
			</div>
		</div>
	);
};

export default SearchPage;
