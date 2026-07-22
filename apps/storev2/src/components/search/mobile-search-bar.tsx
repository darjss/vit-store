import { MinimalisticMagnifierIcon as IconSearch } from "@solar-icons/solid/linear";
import SearchSheet from "./search-sheet";

/**
 * Persistent, full-width search field for the top of the home and catalog
 * pages on mobile. Opens the shared full-screen search sheet from the bottom.
 */
const MobileSearchBar = () => (
	<SearchSheet
		position="bottom"
		triggerAriaLabel="Хайх"
		triggerClass="flex h-12 w-full items-center gap-2.5 rounded-full border border-border bg-card px-4 text-left text-muted-foreground shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-quart hover:bg-muted active:scale-[0.99]"
		contentClass="h-[85vh] w-full max-w-none border-border border-t p-0"
		headerClass="bg-primary/10"
		triggerContent={
			<>
				<IconSearch class="h-5 w-5 shrink-0" aria-hidden="true" />
				<span class="truncate font-medium text-sm">
					Омега-3, магни, нойргүйдэл…
				</span>
			</>
		}
	/>
);

export default MobileSearchBar;
