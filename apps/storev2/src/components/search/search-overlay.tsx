import IconSearch from "~icons/ri/search-line";
import SearchSheet from "./search-sheet";

const SearchOverlay = () => (
	<SearchSheet
		position="top"
		triggerAriaLabel="Хайх"
		triggerClass="flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-muted/70 px-4 text-left text-muted-foreground shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-quart hover:bg-muted hover:shadow-soft active:scale-[0.99]"
		triggerContent={
			<>
				<IconSearch class="h-4 w-4 shrink-0" aria-hidden="true" />
				<span class="truncate font-medium text-sm">
					Омега-3, магни, нойргүйдэл…
				</span>
			</>
		}
	/>
);

export default SearchOverlay;
