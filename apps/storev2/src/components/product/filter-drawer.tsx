import { keepPreviousData, useQuery } from "@tanstack/solid-query";
import { formatCurrency } from "@vit/shared";
import {
	parseSort,
	productSortOptions,
	type SortSelection,
} from "@vit/shared/domain/product";
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
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Slider,
	SliderFill,
	SliderThumb,
	SliderTrack,
} from "@/components/ui/slider";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export const PRICE_MIN = 0;
export const PRICE_MAX = 500000;
export const PRICE_STEP = 10000;

const COUNT_DEBOUNCE_MS = 250;

/**
 * Trailing-edge debounce for a signal. Returns a read signal that updates
 * `ms` after the source stops changing. Used to throttle the filter-drawer
 * live count query so a price-slider drag (many ticks/sec) fires one network
 * request instead of one per tick.
 */
function createDebouncedSignal<T>(
	source: () => T,
	ms: number,
): () => T {
	const [debounced, setDebounced] = createSignal<T>(source());
	let timer: ReturnType<typeof setTimeout> | undefined;
	createEffect(() => {
		const value = source();
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => setDebounced(() => value), ms);
	});
	onCleanup(() => {
		if (timer) clearTimeout(timer);
	});
	return debounced;
}

const CATEGORY_PREVIEW_COUNT = 8;
const BRAND_PREVIEW_COUNT = 6;

type FacetOption = {
	id: number;
	name: string;
	slug: string;
	productCount?: number;
};

type FilterDrawerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	categories: FacetOption[];
	brands: FacetOption[];
	sortField: string | null;
	sortDirection: string | null;
	categoryId: number | null;
	brandId: number | null;
	priceRange: [number, number];
	listFilter: "featured" | "recent" | null;
	includeOutOfStock: boolean;
	onApply: (next: {
		sortField: string | null;
		sortDirection: string | null;
		categoryId: number | null;
		brandId: number | null;
		priceRange: [number, number];
		includeOutOfStock: boolean;
	}) => void;
	onReset: () => void;
};

const boundPrice = (range: [number, number]) => ({
	minPrice: range[0] <= PRICE_MIN ? undefined : range[0],
	maxPrice: range[1] >= PRICE_MAX ? undefined : range[1],
});

const FacetChip = (props: {
	label: string;
	active: boolean;
	onClick: () => void;
}) => (
	<button
		type="button"
		aria-pressed={props.active}
		onClick={props.onClick}
		class={cn(
			"flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-semibold text-sm transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]",
			props.active
				? "border-cocoa bg-primary shadow-lift"
				: "border-border bg-background",
		)}
	>
		{props.label}
	</button>
);

const ToggleSwitch = (props: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	ariaLabel: string;
}) => (
	<button
		type="button"
		role="switch"
		aria-checked={props.checked}
		aria-label={props.ariaLabel}
		onClick={() => props.onChange(!props.checked)}
		class={cn(
			"relative h-7 w-12 shrink-0 rounded-full border transition-[background-color] duration-200 ease-out",
			props.checked ? "border-cocoa bg-primary" : "border-border bg-muted",
		)}
	>
		<span
			class={cn(
				"absolute top-0.5 size-5 rounded-full bg-card shadow-soft-sm transition-[left] duration-200 ease-out",
				props.checked ? "left-[22px]" : "left-0.5",
			)}
		/>
	</button>
);

const SectionLabel = (props: { children: JSX.Element }) => (
	<p class="mb-2.5 font-bold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
		{props.children}
	</p>
);

const FilterDrawer = (props: FilterDrawerProps) => {
	const [draftSortField, setDraftSortField] = createSignal<string | null>(null);
	const [draftSortDirection, setDraftSortDirection] = createSignal<
		string | null
	>(null);
	const [draftCategoryId, setDraftCategoryId] = createSignal<number | null>(
		null,
	);
	const [draftBrandId, setDraftBrandId] = createSignal<number | null>(null);
	const [draftPriceRange, setDraftPriceRange] = createSignal<[number, number]>([
		PRICE_MIN,
		PRICE_MAX,
	]);
	const [draftIncludeOutOfStock, setDraftIncludeOutOfStock] =
		createSignal(true);
	const [showAllCategories, setShowAllCategories] = createSignal(false);
	const [showAllBrands, setShowAllBrands] = createSignal(false);

	createEffect(() => {
		if (!props.open) return;
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
		showAllCategories()
			? props.categories
			: props.categories.slice(0, CATEGORY_PREVIEW_COUNT),
	);
	const visibleBrands = createMemo(() =>
		showAllBrands() ? props.brands : props.brands.slice(0, BRAND_PREVIEW_COUNT),
	);

	// Debounce every input that feeds the live count query so a slider drag
	// (dozens of ticks/sec) or rapid chip toggles produce one trailing request
	// instead of one per change.
	const debouncedSortField = createDebouncedSignal(
		draftSortField,
		COUNT_DEBOUNCE_MS,
	);
	const debouncedSortDirection = createDebouncedSignal(
		draftSortDirection,
		COUNT_DEBOUNCE_MS,
	);
	const debouncedCategoryId = createDebouncedSignal(
		draftCategoryId,
		COUNT_DEBOUNCE_MS,
	);
	const debouncedBrandId = createDebouncedSignal(
		draftBrandId,
		COUNT_DEBOUNCE_MS,
	);
	const debouncedPriceRange = createDebouncedSignal(
		draftPriceRange,
		COUNT_DEBOUNCE_MS,
	);
	const debouncedIncludeOutOfStock = createDebouncedSignal(
		draftIncludeOutOfStock,
		COUNT_DEBOUNCE_MS,
	);

	const countQuery = useQuery(
		() => ({
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
			],
			queryFn: async () => {
				const sort: SortSelection | null = parseSort(
					debouncedSortField(),
					debouncedSortDirection(),
				);
				const { minPrice, maxPrice } = boundPrice(debouncedPriceRange());
				const result = await api.product.getPaginatedProducts.query({
					page: 1,
					pageSize: 1,
					categoryId: debouncedCategoryId() ?? undefined,
					brandId: debouncedBrandId() ?? undefined,
					listType: props.listFilter ?? undefined,
					sortField: sort?.field,
					sortDirection: sort?.direction,
					minPrice,
					maxPrice,
					requireStock: !debouncedIncludeOutOfStock(),
				});
				return result.pagination.totalCount;
			},
			placeholderData: keepPreviousData,
			staleTime: 1000 * 60,
			enabled: props.open,
		}),
		() => queryClient,
	);

	const countStatus = createMemo(() => {
		if (countQuery.isError) return "error" as const;
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
			sortField: draftSortField(),
			sortDirection: draftSortDirection(),
			categoryId: draftCategoryId(),
			brandId: draftBrandId(),
			priceRange: draftPriceRange(),
			includeOutOfStock: draftIncludeOutOfStock(),
		});
		props.onOpenChange(false);
	};

	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent
				position="bottom"
				class="flex max-h-[88vh] flex-col rounded-t-2xl border-border border-t bg-card p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
			>
				<div class="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" />
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-bold font-display text-lg tracking-tight">
						Шүүлтүүр
					</SheetTitle>
				</SheetHeader>

				<div class="flex flex-col gap-6 overflow-y-auto px-5 py-5">
					<div>
						<SectionLabel>Эрэмбэ</SectionLabel>
						<div class="flex flex-wrap gap-2">
							<For each={productSortOptions}>
								{(option) => {
									const active = () =>
										draftSortField() === option.field &&
										draftSortDirection() === option.direction;
									return (
										<FacetChip
											label={option.label}
											active={active()}
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
											label={category.name}
											active={draftCategoryId() === category.id}
											onClick={() =>
												setDraftCategoryId(
													draftCategoryId() === category.id
														? null
														: category.id,
												)
											}
										/>
									)}
								</For>
							</div>
							<Show
								when={
									!showAllCategories() &&
									props.categories.length > CATEGORY_PREVIEW_COUNT
								}
							>
								<button
									type="button"
									onClick={() => setShowAllCategories(true)}
									class="mt-2.5 font-bold text-cocoa text-xs underline"
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
											label={brand.name}
											active={draftBrandId() === brand.id}
											onClick={() =>
												setDraftBrandId(
													draftBrandId() === brand.id ? null : brand.id,
												)
											}
										/>
									)}
								</For>
							</div>
							<Show
								when={
									!showAllBrands() && props.brands.length > BRAND_PREVIEW_COUNT
								}
							>
								<button
									type="button"
									onClick={() => setShowAllBrands(true)}
									class="mt-2.5 font-bold text-cocoa text-xs underline"
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
							minValue={PRICE_MIN}
							maxValue={PRICE_MAX}
							step={PRICE_STEP}
							value={draftPriceRange()}
							onChange={(value) =>
								setDraftPriceRange([value[0], value[1] ?? PRICE_MAX])
							}
							getValueLabel={(params) =>
								`${formatCurrency(params.values[0])} – ${formatCurrency(params.values[1])}`
							}
						>
							<SliderTrack class="bg-muted">
								<SliderFill class="bg-primary-deep" />
								<SliderThumb class="border-cocoa" />
								<SliderThumb class="border-cocoa" />
							</SliderTrack>
						</Slider>
						<div class="mt-3 flex items-center justify-between font-semibold text-sm">
							<span>{formatCurrency(draftPriceRange()[0])}</span>
							<span>{formatCurrency(draftPriceRange()[1])}</span>
						</div>
					</div>

					<div class="flex items-center justify-between">
						<div>
							<p class="font-semibold text-sm">Зөвхөн нөөцтэй</p>
							<p class="text-muted-foreground text-xs">Дууссан барааг нуух</p>
						</div>
						<ToggleSwitch
							checked={!draftIncludeOutOfStock()}
							onChange={(checked) => setDraftIncludeOutOfStock(!checked)}
							label="Зөвхөн нөөцтэй"
							ariaLabel="Зөвхөн нөөцтэй бараа харуулах"
						/>
					</div>
				</div>

				<div class="flex gap-2.5 border-border border-t bg-card px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
					<button
						type="button"
						onClick={handleReset}
						class="flex h-12 items-center justify-center rounded-xl border border-border bg-background px-5 font-semibold text-sm transition-transform duration-200 ease-out active:scale-[0.97]"
					>
						Цэвэрлэх
					</button>
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<button
							type="button"
							onClick={handleApply}
							class="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cocoa bg-primary font-bold font-display text-base shadow-lift transition-transform duration-200 ease-out active:scale-[0.97]"
							aria-label="Шүүлтүүрээр бараа харах"
						>
							<span>Харах</span>
							<Switch>
								<Match when={countStatus() === "ready"}>
									<span class="rounded-full bg-secondary px-2.5 py-0.5 text-secondary-foreground text-sm tabular-nums">
										{countQuery.data}
									</span>
								</Match>
								<Match when={countStatus() === "loading"}>
									<span class="text-secondary text-sm" aria-label="Тоо шинэчилж байна">
										…
									</span>
								</Match>
								<Match when={countStatus() === "error"}>
									<span class="text-secondary text-sm" aria-label="Тоо харагдахгүй байна">
										—
									</span>
								</Match>
							</Switch>
						</button>
						<Show when={countStatus() === "error"}>
							<div class="flex items-center justify-between gap-2 px-1 text-destructive text-xs" role="alert">
								<span>Тоо ачаалж чадсангүй</span>
								<button
									type="button"
									onClick={() => countQuery.refetch()}
									class="min-h-11 shrink-0 font-bold underline underline-offset-2"
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
