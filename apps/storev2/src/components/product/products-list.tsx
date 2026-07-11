import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { parseSort } from "@vit/shared/domain/product";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import { hydrateServerState } from "@/lib/hydration";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import IconEqualizer from "~icons/ri/equalizer-line";
import IconSearch from "~icons/ri/search-line";
import SearchSheet from "../search/search-sheet";
import AppliedFilters from "./applied-filters";
import FilterDrawer from "./filter-drawer";
import ProductCard from "./product-card";
import {
	ProductEmptyState,
	ProductErrorState,
	ProductListEnd,
	ProductSkeletonGrid,
} from "./products-list-states";
import { useProductFilters } from "./use-product-filters";

type FilterOption = {
	id: number;
	name: string;
	slug: string;
};

type ProductsListProps = {
	dehydratedState?: string;
	initialCategories?: FilterOption[];
	initialBrands?: FilterOption[];
	totalProductCount?: number;
};

const ProductsList = (props: ProductsListProps) => {
	hydrateServerState(queryClient, props.dehydratedState);

	const [filterDrawerOpen, setFilterDrawerOpen] = createSignal(false);
	const filterSheetFocusRestore = createSheetFocusRestore();
	const [lastLoggedProductsError, setLastLoggedProductsError] =
		createSignal<unknown>();

	const categoriesQuery = useQuery(
		() => ({
			queryKey: ["categories"],
			queryFn: () => api.category.getAllCategoriesWithStock.query(),
			initialData: props.initialCategories,
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const brandsQuery = useQuery(
		() => ({
			queryKey: ["brands"],
			queryFn: () => api.brand.getAllBrandsWithStock.query(),
			initialData: props.initialBrands,
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const filters = useProductFilters({
		categories: () => categoriesQuery.data,
		brands: () => brandsQuery.data,
	});

	// Remove the SSR fallback grid once the client island mounts. Both grids
	// use the same plain CSS grid layout, so the swap is seamless (no layout
	// shift / blink from a virtual absolute-positioned grid).
	onMount(() => {
		document.getElementById("products-ssr")?.remove();
	});

	// Clean invalid sort/dir URL params silently. Single source of truth:
	// parseSort is shared with the filter drawer and SEO sort routes.
	createEffect(() => {
		if (
			(filters.sortField() || filters.sortDirection()) &&
			!parseSort(filters.sortField(), filters.sortDirection())
		) {
			filters.applyFilters({
				sortField: null,
				sortDirection: null,
				categoryId: filters.categoryId(),
				brandId: filters.brandId(),
				priceRange: filters.priceRange(),
				includeOutOfStock: filters.includeOutOfStock(),
			});
		}
	});

	const searchQuery = useQuery(
		() => ({
			queryKey: [
				"search-products-page",
				filters.searchTerm(),
				filters.categoryId(),
				filters.brandId(),
				filters.includeOutOfStock(),
			],
			queryFn: async () => {
				const term = filters.searchTerm();
				if (!term || term.length < 2) return [];
				return await api.product.searchProductsForPage.query({
					query: term,
					limit: 10,
					categoryId: filters.categoryId() ?? undefined,
					brandId: filters.brandId() ?? undefined,
					requireStock: !filters.includeOutOfStock(),
				});
			},
			enabled: filters.isSearchMode(),
			staleTime: 1000 * 60 * 5, // 5 minutes
			placeholderData: keepPreviousData,
		}),
		() => queryClient,
	);

	const productsQuery = useInfiniteQuery(
		() => ({
			queryKey: [
				"products-browse",
				filters.selectedSort()?.field,
				filters.selectedSort()?.direction,
				filters.categoryId(),
				filters.brandId(),
				filters.listFilter(),
				filters.minPrice(),
				filters.maxPrice(),
				filters.includeOutOfStock(),
			],
			queryFn: async ({ pageParam }) => {
				const sort = filters.selectedSort();
				return await api.product.getInfiniteProducts.query({
					cursor: pageParam,
					limit: 12,
					listType: filters.listFilter() ?? undefined,
					sortField: sort?.field,
					sortDirection: sort?.direction,
					categoryId: filters.categoryId() ?? undefined,
					brandId: filters.brandId() ?? undefined,
					minPrice: filters.minPrice(),
					maxPrice: filters.maxPrice(),
					requireStock: !filters.includeOutOfStock(),
				});
			},
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			placeholderData: keepPreviousData,
			enabled: !filters.isSearchMode(),
		}),
		() => queryClient,
	);

	const searchResults = createMemo(() => searchQuery.data ?? []);
	const isSearchLoading = createMemo(
		() => searchQuery.isLoading && !searchQuery.data,
	);
	const isSearchRefetching = createMemo(
		() =>
			searchQuery.isFetching && !searchQuery.isLoading && !!searchQuery.data,
	);

	const isInitialLoading = createMemo(() => {
		if (filters.isSearchMode()) return isSearchLoading();
		return productsQuery.isLoading && !productsQuery.data;
	});

	const isRefetching = createMemo(() => {
		if (filters.isSearchMode()) return isSearchRefetching();
		return (
			productsQuery.isFetching &&
			!productsQuery.isLoading &&
			!productsQuery.isFetchingNextPage &&
			!!productsQuery.data
		);
	});

	const allBrowseProducts = createMemo(() => {
		const data = productsQuery.data;
		if (!data) return [];
		return data.pages.flatMap((page) => page.items);
	});

	const hasProducts = createMemo(() => {
		if (filters.isSearchMode()) return searchResults().length > 0;
		return allBrowseProducts().length > 0;
	});
	const hasInitialBrowseError = createMemo(
		() =>
			!filters.isSearchMode() &&
			productsQuery.isError &&
			allBrowseProducts().length === 0,
	);

	// Log the infinite-products failure once with wide-event context. The query
	// label reflects the actual procedure variant (WithStock vs all) so logs are
	// not misleading when the includeOutOfStock toggle switches the call.
	createEffect(() => {
		const error = productsQuery.error;
		if (
			!productsQuery.isError ||
			!error ||
			lastLoggedProductsError() === error
		) {
			return;
		}

		setLastLoggedProductsError(error);
		const sort = filters.selectedSort();
		const details =
			error instanceof Error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack,
					}
				: { name: typeof error, message: String(error) };
		const queryName = filters.includeOutOfStock()
			? "product.getInfiniteProducts"
			: "product.getInfiniteProducts (requireStock)";
		const context = {
			...details,
			component: "ProductsList",
			query: queryName,
			pageUrl: window.location.href,
			userAgent: window.navigator.userAgent,
			isOnline: window.navigator.onLine,
			devicePixelRatio: window.devicePixelRatio,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
			loadedProductCount: allBrowseProducts().length,
			loadedPageCount: productsQuery.data?.pages.length ?? 0,
			hasNextPage: productsQuery.hasNextPage,
			isFetching: productsQuery.isFetching,
			isFetchingNextPage: productsQuery.isFetchingNextPage,
			sortField: sort?.field ?? null,
			sortDirection: sort?.direction ?? null,
			categoryId: filters.categoryId(),
			brandId: filters.brandId(),
			listFilter: filters.listFilter(),
		};

		console.error("[ProductsList] Infinite products query failed", context);
	});

	const shouldShowEmptyState = createMemo(() => {
		if (filters.isSearchMode()) {
			return (
				searchQuery.data !== undefined &&
				!searchQuery.isLoading &&
				!searchQuery.isFetching &&
				searchResults().length === 0
			);
		}
		return (
			productsQuery.data &&
			!productsQuery.isLoading &&
			!productsQuery.isFetching &&
			allBrowseProducts().length === 0
		);
	});

	const productCount = createMemo(() => {
		if (filters.isSearchMode()) return searchResults().length;
		return allBrowseProducts().length;
	});
	const productCountLabel = createMemo(() => {
		if (
			!filters.isSearchMode() &&
			filters.isBrowsingAll() &&
			props.totalProductCount != null
		) {
			return `${props.totalProductCount} бүтээгдэхүүн`;
		}
		if (shouldShowEmptyState()) return "0 бүтээгдэхүүн";
		if (filters.isSearchMode() && hasProducts()) {
			return `${productCount()} бүтээгдэхүүн`;
		}
		if (!filters.isSearchMode() && hasProducts() && !productsQuery.hasNextPage) {
			return `${productCount()} бүтээгдэхүүн`;
		}
		return `${productCount()}+ бүтээгдэхүүн`;
	});

	const retryProducts = () => {
		if (filters.isSearchMode()) {
			searchQuery.refetch();
			return;
		}
		if (allBrowseProducts().length > 0 && productsQuery.hasNextPage) {
			productsQuery.fetchNextPage();
			return;
		}
		productsQuery.refetch();
	};

	const setupObserver = (element: HTMLDivElement) => {
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (
					entry.isIntersecting &&
					productsQuery.hasNextPage &&
					!productsQuery.isFetchingNextPage &&
					!productsQuery.isLoading
				) {
					productsQuery.fetchNextPage();
				}
			},
			{ rootMargin: "300px", threshold: 0.1 },
		);

		observer.observe(element);
		onCleanup(() => {
			observer.unobserve(element);
			observer.disconnect();
		});
	};

	return (
		<div class="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
			<div>
				{/* Compact Header on wash tint */}
				<div
					class={cn(
						"mb-3 flex flex-col gap-1 rounded-2xl border border-border px-4 py-4 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4 sm:px-6 sm:py-5",
						washBg("all-products"),
					)}
				>
					<h1 class="font-bold font-display text-lg leading-tight tracking-tight sm:text-xl lg:text-2xl">
						{filters.pageTitle()}
					</h1>
					<Show
						when={!isInitialLoading()}
						fallback={
							<div class="h-3.5 w-20 animate-pulse rounded bg-muted sm:h-4 sm:w-24 lg:h-5 lg:w-28" />
						}
					>
						<span class="font-medium text-foreground/70 text-xs sm:text-sm lg:text-base">
							{productCountLabel()}
						</span>
					</Show>
				</div>

				{/* Search + filter trigger topbar */}
				<div class="-mx-3 sm:-mx-6 lg:-mx-8 sticky top-0 z-30 mb-3 flex items-center gap-2 border-border border-b bg-background/95 px-3 py-2.5 supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-md sm:px-6 lg:px-8">
					<SearchSheet
						position="bottom"
						triggerAriaLabel="Хайх"
						triggerClass="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left text-muted-foreground shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.99]"
						contentClass="h-[85vh] w-full max-w-none border-border border-t p-0"
						headerClass="bg-primary/10"
						inputPlaceholder="Омега-3, магни, нойргүйдэл…"
						triggerContent={
							<>
								<IconSearch class="h-5 w-5 shrink-0" aria-hidden="true" />
								<span class="truncate font-medium text-sm">Хайх...</span>
							</>
						}
					/>
					<button
						type="button"
						onClick={(event) => {
							filterSheetFocusRestore.register(event.currentTarget);
							setFilterDrawerOpen(true);
						}}
						aria-label="Шүүлтүүр нээх"
						class="relative flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 font-bold text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
					>
						<IconEqualizer class="h-4 w-4" />
						<span>Шүүлтүүр</span>
						<Show when={filters.activeFilterCount() > 0}>
							<span class="flex size-5 items-center justify-center rounded-full border border-cocoa bg-primary font-bold text-[11px]">
								{filters.activeFilterCount()}
							</span>
						</Show>
					</button>
				</div>

				<AppliedFilters
					chips={filters.appliedChips()}
					onClearAll={filters.handleClearFilters}
				/>

				<FilterDrawer
					open={filterDrawerOpen()}
					onOpenChange={setFilterDrawerOpen}
					focusRestore={filterSheetFocusRestore}
					categories={categoriesQuery.data ?? []}
					brands={brandsQuery.data ?? []}
					sortField={filters.sortField()}
					sortDirection={filters.sortDirection()}
					categoryId={filters.categoryId()}
					brandId={filters.brandId()}
					priceRange={filters.priceRange()}
					listFilter={filters.listFilter()}
					includeOutOfStock={filters.includeOutOfStock()}
					onApply={filters.applyFilters}
					onReset={filters.resetDrawerFilters}
				/>

				{/* Products Grid */}
				<Show
					when={hasProducts() || isRefetching()}
					fallback={
						<Show
							when={isInitialLoading()}
							fallback={
								<Show
									when={hasInitialBrowseError()}
									fallback={
										<Show when={shouldShowEmptyState()}>
											<ProductEmptyState
												hasActiveFilters={filters.hasActiveFilters()}
												onClearFilters={filters.handleClearFilters}
											/>
										</Show>
									}
								>
									<ProductErrorState onRetry={retryProducts} />
								</Show>
							}
						>
							{/* Initial Loading Skeleton */}
							<ProductSkeletonGrid count={8} />
						</Show>
					}
				>
					{/* Products Grid with refetching overlay */}
					<div class="relative">
						{/* Loading indicator for initial load */}
						<Show when={isInitialLoading()}>
							<div class="absolute inset-0 z-10 flex items-center justify-center bg-background/90 backdrop-blur-sm">
								<div class="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-soft sm:gap-3.5 sm:px-6 sm:py-5 sm:shadow-soft-lg lg:px-8 lg:py-6">
									<div class="h-6 w-6 animate-spin rounded-full border border-border border-t-transparent sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
									<p class="font-bold text-xs sm:text-sm lg:text-base">
										Ачааллаж байна...
									</p>
								</div>
							</div>
						</Show>
						<div
							class={cn(
								"transition-opacity duration-200",
								isRefetching() && "pointer-events-none opacity-50",
							)}
						>
							{/* Search mode: render search results */}
							<Show when={filters.isSearchMode()}>
								<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
									<For each={searchResults()}>
										{(product) => <ProductCard product={product} />}
									</For>
								</div>
							</Show>
							{/* Browse mode: plain CSS grid. content-visibility:auto keeps
							    off-screen cards cheap to render without custom
							    virtualization — pages are 12 items, so even dozens of
							    loaded pages are a trivial DOM size. */}
							<Show when={!filters.isSearchMode()}>
								<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 [content-visibility:auto]">
									<For each={allBrowseProducts()}>
										{(product) => <ProductCard product={product} />}
									</For>
								</div>
							</Show>
						</div>
					</div>
				</Show>

				{/* Error State */}
				<Show
					when={
						filters.isSearchMode()
							? searchQuery.isError
							: productsQuery.isError && allBrowseProducts().length > 0
					}
				>
					<ProductErrorState onRetry={retryProducts} />
				</Show>

				{/* Loading More Skeleton (browse mode only) */}
				<Show when={!filters.isSearchMode() && productsQuery.isFetchingNextPage}>
					<ProductSkeletonGrid
						count={4}
						class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:mt-6 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
					/>
				</Show>

				{/* End of List */}
				<Show
					when={
						filters.isSearchMode()
							? searchResults().length > 0
							: productsQuery.data &&
								!productsQuery.hasNextPage &&
								allBrowseProducts().length > 0
					}
				>
					<ProductListEnd count={productCount()} />
				</Show>

				{/* Infinite Scroll Sentinel (browse mode only) */}
				<Show
					when={
						!filters.isSearchMode() &&
						productsQuery.hasNextPage &&
						productsQuery.data &&
						!productsQuery.isFetchingNextPage
					}
				>
					<div ref={setupObserver} class="h-2 w-full" aria-hidden="true" />
				</Show>
			</div>
		</div>
	);
};

export default ProductsList;
