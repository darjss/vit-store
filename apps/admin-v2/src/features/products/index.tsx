import { AddSquareIcon } from "@solar-icons/solid/linear/add-square";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { MagnifierIcon } from "@solar-icons/solid/linear/magnifier";
import { Button, Input, Toaster } from "@vit/ui";
import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	Show,
} from "solid-js";

import { Filters } from "./components/filters";
import { FormDialog } from "./components/form-dialog";
import { InstantSearch } from "./components/instant-search";
import { ProductList } from "./components/product-list";
import { ProductForm } from "./form/product-form";
import type { ProductListFilters } from "./queries";
import { useProductListNavigate, useProductListSearch } from "./search";

export function ProductsPage() {
	const search = useProductListSearch();
	const patchSearch = useProductListNavigate();

	const [searchInput, setSearchInput] = createSignal(search().searchTerm ?? "");
	const [debounced, setDebounced] = createSignal(search().searchTerm ?? "");
	const [createOpen, setCreateOpen] = createSignal(false);

	// Debounce the input, then push the settled term into the URL (replace so
	// typing does not spam history). Filters stay deep-linkable and
	// back-button-safe.
	createEffect(() => {
		const timer = setTimeout(() => setDebounced(searchInput()), 300);
		onCleanup(() => clearTimeout(timer));
	});

	createEffect(() => {
		const current = (search().searchTerm ?? "").trim();
		const next = debounced().trim();
		if (current !== next) {
			patchSearch({ searchTerm: next || undefined }, { replace: true });
		}
	});

	// External changes (back button, clear-filters) reset the input too.
	createEffect(() => {
		const term = search().searchTerm ?? "";
		setSearchInput(term);
		setDebounced(term);
	});

	const query = () => debounced().trim();
	const instantActive = () => query().length >= 2;
	const isTyping = () =>
		searchInput().trim() !== debounced().trim() &&
		searchInput().trim().length >= 2;

	const filters = createMemo<ProductListFilters>(() => ({
		brandId: search().brandId,
		categoryId: search().categoryId,
		status: search().status,
		sortField: search().sortField,
		sortDirection: search().sortDirection,
		searchTerm: query() || undefined,
	}));

	const hasActiveFilters = () =>
		search().brandId !== undefined ||
		search().categoryId !== undefined ||
		search().status !== undefined ||
		search().sortField !== undefined ||
		(search().searchTerm ?? "") !== "";

	const clearSearch = () => {
		setSearchInput("");
		setDebounced("");
		patchSearch({ searchTerm: undefined }, { replace: true });
	};

	const clearAllFilters = () => {
		setSearchInput("");
		setDebounced("");
		patchSearch({
			brandId: undefined,
			categoryId: undefined,
			status: undefined,
			sortField: undefined,
			sortDirection: undefined,
			searchTerm: undefined,
		});
	};

	return (
		<div class="space-y-4">
			<Toaster />

			<header class="flex items-end justify-between gap-3">
				<div class="min-w-0">
					<h1 class="font-extrabold text-2xl text-ink tracking-tight">Бараа</h1>
					<p class="mt-1 text-[13px] text-ink-2">
						Жагсаалт, хайлт, шүүлт, нөөц удирдлага.
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)} class="shrink-0">
					<AddSquareIcon />
					<span>Шинэ бараа</span>
				</Button>
			</header>

			<div class="relative">
				<MagnifierIcon
					class="-translate-y-1/2 absolute top-1/2 left-4 size-5 text-ink-2"
					aria-hidden="true"
				/>
				<Input
					type="search"
					value={searchInput()}
					onInput={(event) => setSearchInput(event.currentTarget.value)}
					placeholder="Бараа хайх…"
					aria-label="Бараа хайх"
					class="h-12 rounded-ui border border-rule bg-surface pr-12 pl-12"
				/>
				<Show when={searchInput()}>
					<button
						type="button"
						onClick={clearSearch}
						aria-label="Хайлт цэвэрлэх"
						class="-translate-y-1/2 absolute top-1/2 right-2 grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<CloseCircleIcon class="size-5" />
					</button>
				</Show>
			</div>

			<Filters
				search={search}
				onPatch={patchSearch}
				hasActiveFilters={hasActiveFilters}
			/>

			<Show
				when={instantActive()}
				fallback={
					<ProductList
						filters={filters}
						search={search}
						onCreate={() => setCreateOpen(true)}
						onClearFilters={clearAllFilters}
					/>
				}
			>
				<InstantSearch
					filters={() => ({
						query: query(),
						brandId: search().brandId,
						categoryId: search().categoryId,
						status: search().status,
					})}
					isTyping={isTyping}
					onClear={clearSearch}
				/>
			</Show>

			<FormDialog
				open={createOpen()}
				onOpenChange={setCreateOpen}
				title="Шинэ бараа нэмэх"
			>
				{(reportDirty) => (
					<ProductForm
						onDirtyChange={reportDirty}
						onSaved={() => setCreateOpen(false)}
					/>
				)}
			</FormDialog>
		</div>
	);
}
