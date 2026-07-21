import IconSearch from "~icons/ri/search-line";
import SearchSheet from "./search-sheet";

/**
 * Mobile-optimized search button for the bottom navigation bar.
 * Opens the shared full-screen search sheet from the bottom.
 */
const MobileSearchButton = () => (
	<SearchSheet
		position="bottom"
		triggerAriaLabel="Хайх"
		triggerClass="group flex w-full min-h-[48px] items-center justify-center rounded-full px-2 py-1.5 text-foreground/70 transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		contentClass="h-[85vh] w-full max-w-none border-border border-t p-0"
		headerClass="bg-primary/10"
		triggerContent={
			<div class="flex flex-col items-center gap-1">
				<IconSearch
					class="h-5 w-5 transition-transform duration-200 group-hover:scale-110"
					aria-hidden="true"
				/>
				<p class="font-bold text-[11px] leading-none">Хайх</p>
			</div>
		}
	/>
);

export default MobileSearchButton;
