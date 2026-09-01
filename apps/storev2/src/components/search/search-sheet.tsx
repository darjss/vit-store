import { navigate } from "astro:transitions/client";
import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { addSearch } from "@/lib/search-history";
import { MinimalisticMagnifierIcon as IconSearch } from "@solar-icons/solid/linear";
import SearchInput from "./search-input";
import SearchTakeover from "./search-takeover";

interface SearchSheetProps {
	contentClass?: string;
	headerClass?: string;
	inputPlaceholder?: string;
	position: "top" | "bottom";
	triggerAriaLabel: string;
	triggerClass: string;
	triggerContent: JSX.Element;
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
			document.removeEventListener("astro:before-preparation", handleNavigation);
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
		<Sheet onOpenChange={setIsOpen} open={isOpen()}>
			<SheetTrigger
				aria-label={props.triggerAriaLabel}
				as="button"
				class={props.triggerClass}
				type="button"
			>
				{props.triggerContent}
			</SheetTrigger>

			<SheetContent
				class={props.contentClass ?? DEFAULT_CONTENT_CLASS}
				closeLabel="Хайлтыг хаах"
				position={props.position}
			>
				<div class="flex h-full flex-col">
					<div
						class={`border-border border-b px-4 py-4 sm:px-6 ${props.headerClass ?? "bg-wash-lemon"}`}
					>
						<SheetHeader class="mb-4">
							<SheetTitle class="font-display flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
								<IconSearch class="text-foreground/60 h-6 w-6" />
								Бүтээгдэхүүн хайх
							</SheetTitle>
						</SheetHeader>

						<SearchInput
							autofocus
							focusKey={isOpen()}
							isLoading={isSearching() && searchQuery().length >= 2}
							onSearch={handleSearch}
							onSubmitSearch={handleSubmitSearch}
							placeholder={props.inputPlaceholder ?? DEFAULT_PLACEHOLDER}
							value={searchQuery()}
						/>
					</div>

					<div class="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
						<SearchTakeover
							onClose={handleClose}
							onSearchLoadingChange={setIsSearching}
							onSelectSuggestion={handleSelectSuggestion}
							query={searchQuery()}
						/>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};

export default SearchSheet;
