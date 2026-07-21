import { navigate } from "astro:transitions/client";
import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
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
import SearchTakeover from "./search-takeover";

interface SearchSheetProps {
	position: "top" | "bottom";
	triggerClass: string;
	triggerAriaLabel: string;
	triggerContent: JSX.Element;
	contentClass?: string;
	headerClass?: string;
	inputPlaceholder?: string;
}

const DEFAULT_CONTENT_CLASS =
	"mt-[8vh] left-1/2 right-auto w-full max-w-2xl max-h-[82vh] -translate-x-1/2 rounded-2xl border border-border p-0 shadow-soft-lg";
const DEFAULT_PLACEHOLDER = "Омега-3, магни, нойргүйдэл…";

const SearchSheet = (props: SearchSheetProps) => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [isSearching, setIsSearching] = createSignal(false);

	onMount(() => {
		const handleNavigation = () => setIsOpen(false);
		document.addEventListener("astro:before-preparation", handleNavigation);
		onCleanup(() => {
			document.removeEventListener(
				"astro:before-preparation",
				handleNavigation,
			);
		});
	});

	// Debounced only — SearchInput already owns the immediate typed value.
	// Wiring onValueChange into this signal used to fire searchStorefront on
	// every keystroke and defeated the 300ms debounce.
	const handleSearch = (query: string) => {
		setSearchQuery(query);
		if (query.length >= 2) {
			addSearch(query);
		}
	};

	const handleSelectSuggestion = (term: string) => {
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
		setTimeout(() => setSearchQuery(""), 300);
	};

	return (
		<Sheet open={isOpen()} onOpenChange={setIsOpen}>
			<SheetTrigger
				as="button"
				type="button"
				aria-label={props.triggerAriaLabel}
				class={props.triggerClass}
			>
				{props.triggerContent}
			</SheetTrigger>

			<SheetContent
				position={props.position}
				closeLabel="Хайлтыг хаах"
				class={props.contentClass ?? DEFAULT_CONTENT_CLASS}
			>
				<div class="flex h-full flex-col">
					<div
						class={`border-border border-b px-4 py-4 sm:px-6 ${props.headerClass ?? "bg-wash-lemon"}`}
					>
						<SheetHeader class="mb-4">
							<SheetTitle class="flex items-center gap-2 font-bold font-display text-xl tracking-tight sm:text-2xl">
								<IconSearch class="h-6 w-6 text-foreground/60" />
								Бүтээгдэхүүн хайх
							</SheetTitle>
						</SheetHeader>

						<SearchInput
							value={searchQuery()}
							onSearch={handleSearch}
							onSubmitSearch={handleSubmitSearch}
							isLoading={isSearching() && searchQuery().length >= 2}
							autofocus
							focusKey={isOpen()}
							placeholder={props.inputPlaceholder ?? DEFAULT_PLACEHOLDER}
						/>
					</div>

					<div class="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
						<SearchTakeover
							query={searchQuery()}
							onSelectSuggestion={handleSelectSuggestion}
							onClose={handleClose}
							onSearchLoadingChange={setIsSearching}
						/>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};

export default SearchSheet;
