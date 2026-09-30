import { keepPreviousData, useQuery } from "@tanstack/solid-query";
import { formatCurrency } from "@vit/shared";
import { parseSort, productSortOptions, type SortSelection } from "@vit/shared/domain/product";
import type { JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Match,
	onCleanup,
	Show,
	Switch,
} from "solid-js";
import {
	Sheet,
	SheetContent,
	type SheetFocusRestore,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Slider, SliderFill, SliderThumb, SliderTrack } from "@/components/ui/slider";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export const PRICE_MIN = 0;
export const PRICE_MAX = 500_000;
export const PRICE_STEP = 10_000;

const COUNT_DEBOUNCE_MS = 250;

/**
 * Trailing-edge debounce for a signal. Returns a read signal that updates
 * `ms` after the source stops changing. Used to throttle the filter-drawer
 * live count query so a price-slider drag (many ticks/sec) fires one network
 * request instead of one per tick.
 */
function createDebouncedSignal<T>(source: () => T, ms: number): () => T {
	const [debounced, setDebounced] = createSignal<T>(source());
	let timer: ReturnType<typeof setTimeout> | undefined;
	createEffect(() => {
		const value = source();
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => setDebounced(() => value), ms);
	});
	onCleanup(() => {
		if (timer) {
			clearTimeout(timer);
		}
	});
	return debounced;
}

const CATEGORY_PREVIEW_COUNT = 8;
const BRAND_PREVIEW_COUNT = 6;

type FacetOption = {
	id: number;
	name: string;
	productCount?: number;
	slug: string;
};

type FilterDrawerProps = {
	brandId: number | null;
	brands: Array<FacetOption>;
	categories: Array<FacetOption>;
	categoryId: number | null;
	effectiveSearchTerm: string | null;
	focusRestore: SheetFocusRestore;
	includeOutOfStock: boolean;
	listFilter: "featured" | "recent" | null;
	onApply: (next: {
		brandId: number | null;
		categoryId: number | null;
		includeOutOfStock: boolean;
		priceRange: [number, number];
		sortDirection: string | null;
		sortField: string | null;
	}) => void;
	onOpenChange: (open: boolean) => void;
	onReset: () => void;
	open: boolean;
	priceRange: [number, number];
	sortDirection: string | null;
	sortField: string | null;
};

const boundPrice = (range: [number, number]) => ({
	maxPrice: range[1] >= PRICE_MAX ? undefined : range[1],
	minPrice: range[0] <= PRICE_MIN ? undefined : range[0],
});

const FacetChip = (props: { active: boolean; label: string; onClick: () => void }) => (
	<button
		aria-pressed={props.active}
		class={cn(
			"flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]",
			props.active ? "border-cocoa bg-primary shadow-lift" : "border-border bg-background",
		)}
		onClick={props.onClick}
		type="button"
	>
		{props.label}
	</button>
);

const ToggleSwitch = (props: {
	ariaLabel: string;
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) => (
	<button
		aria-checked={props.checked}
		aria-label={props.ariaLabel}
		class={cn(
			"relative h-7 w-12 shrink-0 rounded-full border transition-[background-color] duration-200 ease-out",
			props.checked ? "border-cocoa bg-primary" : "border-border bg-muted",
		)}
		onClick={() => props.onChange(!props.checked)}
		role="switch"
		type="button"
	>
		<span
			class={cn(
				"bg-card shadow-soft-sm absolute top-0.5 size-5 rounded-full transition-[left] duration-200 ease-out",
				props.checked ? "left-[22px]" : "left-0.5",
			)}
		/>
	</button>
);

const SectionLabel = (props: { children: JSX.Element }) => (
	<p class="text-muted-foreground mb-2.5 text-[11px] font-bold tracking-[0.08em] uppercase">
		{props.children}
	</p>
);

const FilterDrawer = (props: FilterDrawerProps) => {
	const [draftSortField, setDraftSortField] = createSignal<string | null>(null);
	const [draftSortDirection, setDraftSortDirection] = createSignal<string | null>(null);
	const [draftCategoryId, setDraftCategoryId] = createSignal<number | null>(null);
	const [draftBrandId, setDraftBrandId] = createSignal<number | null>(null);
	const [draftPriceRange, setDraftPriceRange] = createSignal<[number, number]>([
		PRICE_MIN,
		PRICE_MAX,
	]);
	const [draftIncludeOutOfStock, setDraftIncludeOutOfStock] = createSignal(true);
	const [showAllCategories, setShowAllCategories] = createSignal(false);
	const [showAllBrands, setShowAllBrands] = createSignal(false);

	createEffect(() => {
		if (!props.open) {
			return;
		}
		setDraftSortField(props.sortField);
		setDraftSortDirection(props.sortDirection);
		setDraftCategoryId(props.categoryId);
		setDraftBrandId(props.brandId);
		setDraftPriceRange([props.priceRange[0], props.priceRange[1]]);
		setDraftIncludeOutOfStock(props.includeOutOfStock);
		setShowAllCategories(false);
		setShowAllBrands(false);
	});

	const visibleCategories = createMemo(() =>
		showAllCategories() ? props.categories : props.categories.slice(0, CATEGORY_PREVIEW_COUNT),
	);
	const visibleBrands = createMemo(() =>
		showAllBrands() ? props.brands : props.brands.slice(0, BRAND_PREVIEW_COUNT),
	);

	// Debounce every input that feeds the live count query so a slider drag
	// (dozens of ticks/sec) or rapid chip toggles produce one trailing request
	// instead of one per change.
	const debouncedSortField = createDebouncedSignal(draftSortField, COUNT_DEBOUNCE_MS);
	const debouncedSortDirection = createDebouncedSignal(draftSortDirection, COUNT_DEBOUNCE_MS);
	const debouncedCategoryId = createDebouncedSignal(draftCategoryId, COUNT_DEBOUNCE_MS);
	const debouncedBrandId = createDebouncedSignal(draftBrandId, COUNT_DEBOUNCE_MS);
	const debouncedPriceRange = createDebouncedSignal(draftPriceRange, COUNT_DEBOUNCE_MS);
	const debouncedIncludeOutOfStock = createDebouncedSignal(
		draftIncludeOutOfStock,
		COUNT_DEBOUNCE_MS,
	);

	const countQuery = useQuery(
		() => ({
			enabled: props.open,
			placeholderData: keepPreviousData,
			queryFn: async () => {
				const sort: SortSelection | null = parseSort(
					debouncedSortField(),
					debouncedSortDirection(),
				);
				const { maxPrice, minPrice } = boundPrice(debouncedPriceRange());
				const sharedInput = {
					brandId: debouncedBrandId() ?? undefined,
					categoryId: debouncedCategoryId() ?? undefined,
					maxPrice,
					minPrice,
					page: 1,
					pageSize: 1,
					requireStock: !debouncedIncludeOutOfStock(),
					sortDirection: sort?.direction,
					sortField: sort?.field,
				};
				const effectiveSearchTerm = props.effectiveSearchTerm;
				const result = effectiveSearchTerm
					? await api.product.searchProductsForPage.query({
							...sharedInput,
							query: effectiveSearchTerm,
						})
					: await api.product.getPaginatedProducts.query({
							...sharedInput,
							listType: props.listFilter ?? undefined,
						});
				return result.pagination.totalCount;
			},
			queryKey: [
				"filter-count",
				debouncedSortField(),
				debouncedSortDirection(),
				debouncedCategoryId(),
				debouncedBrandId(),
				debouncedPriceRange()[0],
				debouncedPriceRange()[1],
				debouncedIncludeOutOfStock(),
				props.listFilter,
				props.effectiveSearchTerm,
			],
			staleTime: 1000 * 60,
		}),
		() => queryClient,
	);

	const countStatus = createMemo(() => {
		if (countQuery.isError) {
			return "error" as const;
		}
		if (countQuery.isFetching || countQuery.data === undefined) {
			return "loading" as const;
		}
		return "ready" as const;
	});

	const handleReset = () => {
		setDraftSortField(null);
		setDraftSortDirection(null);
		setDraftCategoryId(null);
		setDraftBrandId(null);
		setDraftPriceRange([PRICE_MIN, PRICE_MAX]);
		setDraftIncludeOutOfStock(true);
		props.onReset();
	};

	const handleApply = () => {
		props.onApply({
			brandId: draftBrandId(),
			categoryId: draftCategoryId(),
			includeOutOfStock: draftIncludeOutOfStock(),
			priceRange: draftPriceRange(),
			sortDirection: draftSortDirection(),
			sortField: draftSortField(),
		});
		props.onOpenChange(false);
	};

	return (
		<Sheet onOpenChange={props.onOpenChange} open={props.open}>
			<SheetContent
				class="border-border bg-card flex max-h-[88vh] flex-col rounded-t-2xl border-t p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
				closeLabel="Шүүлтүүрийг хаах"
				focusRestore={props.focusRestore}
				position="bottom"
			>
				<div class="bg-border mx-auto mt-2.5 h-1 w-10 rounded-full" />
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-display text-lg font-bold tracking-tight">Шүүлтүүр</SheetTitle>
				</SheetHeader>

				<div class="flex flex-col gap-6 overflow-y-auto px-5 py-5">
					<div>
						<SectionLabel>Эрэмбэ</SectionLabel>
						<div class="flex flex-wrap gap-2">
							<For each={productSortOptions}>
								{(option) => {
									const active = () =>
										draftSortField() === option.field && draftSortDirection() === option.direction;
									return (
										<FacetChip
											active={active()}
											label={option.label}
											onClick={() => {
												if (active()) {
													setDraftSortField(null);
													setDraftSortDirection(null);
												} else {
													setDraftSortField(option.field);
													setDraftSortDirection(option.direction);
												}
											}}
										/>
									);
								}}
							</For>
						</div>
					</div>

					<Show when={props.categories.length > 0}>
						<div>
							<SectionLabel>Ангилал</SectionLabel>
							<div class="flex flex-wrap gap-2">
								<For each={visibleCategories()}>
									{(category) => (
										<FacetChip
											active={draftCategoryId() === category.id}
											label={category.name}
											onClick={() =>
												setDraftCategoryId(draftCategoryId() === category.id ? null : category.id)
											}
										/>
									)}
								</For>
							</div>
							<Show when={!showAllCategories() && props.categories.length > CATEGORY_PREVIEW_COUNT}>
								<button
									class="text-cocoa mt-2.5 text-xs font-bold underline"
									onClick={() => setShowAllCategories(true)}
									type="button"
								>
									{`+${props.categories.length - CATEGORY_PREVIEW_COUNT} ангилал харах`}
								</button>
							</Show>
						</div>
					</Show>

					<Show when={props.brands.length > 0}>
						<div>
							<SectionLabel>Брэнд</SectionLabel>
							<div class="flex flex-wrap gap-2">
								<For each={visibleBrands()}>
									{(brand) => (
										<FacetChip
											active={draftBrandId() === brand.id}
											label={brand.name}
											onClick={() => setDraftBrandId(draftBrandId() === brand.id ? null : brand.id)}
										/>
									)}
								</For>
							</div>
							<Show when={!showAllBrands() && props.brands.length > BRAND_PREVIEW_COUNT}>
								<button
									class="text-cocoa mt-2.5 text-xs font-bold underline"
									onClick={() => setShowAllBrands(true)}
									type="button"
								>
									Бүх брэнд харах
								</button>
							</Show>
						</div>
					</Show>

					<div>
						<SectionLabel>Үнийн муж</SectionLabel>
						<Slider
							class="mt-3"
							getValueLabel={(params) =>
								`${formatCurrency(params.values[0])} – ${formatCurrency(params.values[1])}`
							}
							maxValue={PRICE_MAX}
							minValue={PRICE_MIN}
							onChange={(value) => setDraftPriceRange([value[0], value[1] ?? PRICE_MAX])}
							step={PRICE_STEP}
							value={draftPriceRange()}
						>
							<SliderTrack class="bg-muted">
								<SliderFill class="bg-primary-deep" />
								<SliderThumb class="border-cocoa" />
								<SliderThumb class="border-cocoa" />
							</SliderTrack>
						</Slider>
						<div class="mt-3 flex items-center justify-between text-sm font-semibold">
							<span>{formatCurrency(draftPriceRange()[0])}</span>
							<span>{formatCurrency(draftPriceRange()[1])}</span>
						</div>
					</div>

					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-semibold">Зөвхөн нөөцтэй</p>
							<p class="text-muted-foreground text-xs">Дууссан барааг нуух</p>
						</div>
						<ToggleSwitch
							ariaLabel="Зөвхөн нөөцтэй бараа харуулах"
							checked={!draftIncludeOutOfStock()}
							label="Зөвхөн нөөцтэй"
							onChange={(checked) => setDraftIncludeOutOfStock(!checked)}
						/>
					</div>
				</div>

				<div class="border-border bg-card flex gap-2.5 border-t px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
					<button
						class="border-border bg-background flex h-12 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition-transform duration-200 ease-out active:scale-[0.97]"
						onClick={handleReset}
						type="button"
					>
						Цэвэрлэх
					</button>
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<button
							aria-label="Шүүлтүүрээр бараа харах"
							class="border-cocoa bg-primary font-display shadow-lift flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-base font-bold transition-transform duration-200 ease-out active:scale-[0.97]"
							onClick={handleApply}
							type="button"
						>
							<span>Харах</span>
							<Switch>
								<Match when={countStatus() === "ready"}>
									<span class="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-sm tabular-nums">
										{countQuery.data}
									</span>
								</Match>
								<Match when={countStatus() === "loading"}>
									<output aria-label="Тоо шинэчилж байна" class="text-secondary text-sm">
										…
									</output>
								</Match>
								<Match when={countStatus() === "error"}>
									<output aria-label="Тоо харагдахгүй байна" class="text-secondary text-sm">
										—
									</output>
								</Match>
							</Switch>
						</button>
						<Show when={countStatus() === "error"}>
							<div
								class="text-destructive flex items-center justify-between gap-2 px-1 text-xs"
								role="alert"
							>
								<span>Тоо ачаалж чадсангүй</span>
								<button
									class="min-h-11 shrink-0 font-bold underline underline-offset-2"
									onClick={() => countQuery.refetch()}
									type="button"
								>
									Дахин оролдох
								</button>
							</div>
						</Show>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};

export default FilterDrawer;
