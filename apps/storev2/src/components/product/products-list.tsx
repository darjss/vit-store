import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { parseSort } from "@vit/shared/domain/product";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import { hydrateServerState } from "@/lib/hydration";
import { captureException } from "@/lib/analytics";
import { errorKind, isNativeError, thrownErrorWireSchema } from "@/lib/error-wire";
import { queryClient } from "@/lib/query";
import { parse } from "valibot";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import {
	TuningIcon as IconEqualizer,
	MinimalisticMagnifierIcon as IconSearch,
} from "@solar-icons/solid/linear";
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
	initialBrands?: Array<FilterOption>;
	initialCategories?: Array<FilterOption>;
	totalProductCount?: number;
};

const ProductsList = (props: ProductsListProps) => {
	hydrateServerState(queryClient, props.dehydratedState);

	const [filterDrawerOpen, setFilterDrawerOpen] = createSignal(false);
	const filterSheetFocusRestore = createSheetFocusRestore();
	const [isLoadMoreInRange, setIsLoadMoreInRange] = createSignal(false);
	const [lastLoggedProductsError, setLastLoggedProductsError] = createSignal<unknown>();

	const categoriesQuery = useQuery(
		() => ({
			initialData: props.initialCategories,
			queryFn: () => api.category.getAllCategoriesWithStock.query(),
			queryKey: ["categories"],
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const brandsQuery = useQuery(
		() => ({
			initialData: props.initialBrands,
			queryFn: () => api.brand.getAllBrandsWithStock.query(),
			queryKey: ["brands"],
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const filters = useProductFilters({
		brands: () => brandsQuery.data,
		categories: () => categoriesQuery.data,
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
				brandId: filters.brandId(),
				categoryId: filters.categoryId(),
				includeOutOfStock: filters.includeOutOfStock(),
				priceRange: filters.priceRange(),
				sortDirection: null,
				sortField: null,
			});
		}
	});

	const searchQuery = useInfiniteQuery(
		() => ({
			enabled: filters.isSearchMode(),
			getNextPageParam: (lastPage) =>
				lastPage.pagination.hasNextPage ? lastPage.pagination.page + 1 : undefined,
			initialPageParam: 1,
			placeholderData: keepPreviousData,
			queryFn: async ({ pageParam }) => {
				const term = filters.effectiveSearchTerm();
				if (!term) {
					throw new Error("Search query must contain at least two characters");
				}
				const sort = filters.selectedSort();
				return await api.product.searchProductsForPage.query({
					brandId: filters.brandId() ?? undefined,
					categoryId: filters.categoryId() ?? undefined,
					maxPrice: filters.maxPrice(),
					minPrice: filters.minPrice(),
					page: pageParam,
					pageSize: 12,
					query: term,
					requireStock: !filters.includeOutOfStock(),
					sortDirection: sort?.direction,
					sortField: sort?.field,
				});
			},
			queryKey: [
				"search-products-page",
				filters.effectiveSearchTerm(),
				filters.selectedSort()?.field,
				filters.selectedSort()?.direction,
				filters.categoryId(),
				filters.brandId(),
				filters.minPrice(),
				filters.maxPrice(),
				filters.includeOutOfStock(),
			],
			staleTime: 1000 * 60 * 5,
		}),
		() => queryClient,
	);

	const productsQuery = useInfiniteQuery(
		() => ({
			enabled: !filters.isSearchMode(),
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: undefined,
			placeholderData: keepPreviousData,
			queryFn: async ({ pageParam }) => {
				const sort = filters.selectedSort();
				return await api.product.getInfiniteProducts.query({
					brandId: filters.brandId() ?? undefined,
					categoryId: filters.categoryId() ?? undefined,
					cursor: pageParam,
					limit: 12,
					listType: filters.listFilter() ?? undefined,
					maxPrice: filters.maxPrice(),
					minPrice: filters.minPrice(),
					requireStock: !filters.includeOutOfStock(),
					sortDirection: sort?.direction,
					sortField: sort?.field,
				});
			},
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
		}),
		() => queryClient,
	);

	const searchResults = createMemo(() =>
		(searchQuery.data?.pages ?? []).flatMap((page) => page.items),
	);
	const isSearchLoading = createMemo(() => searchQuery.isLoading && !searchQuery.data);
	const isSearchRefetching = createMemo(
		() =>
			searchQuery.isFetching &&
			!searchQuery.isLoading &&
			!searchQuery.isFetchingNextPage &&
			!!searchQuery.data,
	);

	const isInitialLoading = createMemo(() => {
		if (filters.isSearchMode()) {
			return isSearchLoading();
		}
		return productsQuery.isLoading && !productsQuery.data;
	});

	const isRefetching = createMemo(() => {
		if (filters.isSearchMode()) {
			return isSearchRefetching();
		}
		return (
			productsQuery.isFetching &&
			!productsQuery.isLoading &&
			!productsQuery.isFetchingNextPage &&
			!!productsQuery.data
		);
	});

	const allBrowseProducts = createMemo(() => {
		const data = productsQuery.data;
		if (!data) {
			return [];
		}
		return data.pages.flatMap((page) => page.items);
	});

	const hasProducts = createMemo(() => {
		if (filters.isSearchMode()) {
			return searchResults().length > 0;
		}
		return allBrowseProducts().length > 0;
	});
	const hasInitialBrowseError = createMemo(
		() => !filters.isSearchMode() && productsQuery.isError && allBrowseProducts().length === 0,
	);

	// Log the infinite-products failure once with wide-event context. The query
	// label reflects the actual procedure variant (WithStock vs all) so logs are
	// not misleading when the includeOutOfStock toggle switches the call.
	createEffect(() => {
		const error = productsQuery.error;
		if (!productsQuery.isError || !error || lastLoggedProductsError() === error) {
			return;
		}

		setLastLoggedProductsError(error);
		const sort = filters.selectedSort();
		const details = isNativeError(error)
			? {
					message: error.message,
					name: error.name,
					stack: error.stack,
				}
			: {
					message: String(error),
					name: errorKind(parse(thrownErrorWireSchema, error)),
				};
		const queryName = filters.includeOutOfStock()
			? "product.getInfiniteProducts"
			: "product.getInfiniteProducts (requireStock)";
		const context = {
			...details,
			brandId: filters.brandId(),
			categoryId: filters.categoryId(),
			component: "ProductsList",
			devicePixelRatio: window.devicePixelRatio,
			hasNextPage: productsQuery.hasNextPage,
			isFetching: productsQuery.isFetching,
			isFetchingNextPage: productsQuery.isFetchingNextPage,
			isOnline: window.navigator.onLine,
			listFilter: filters.listFilter(),
			loadedPageCount: productsQuery.data?.pages.length ?? 0,
			loadedProductCount: allBrowseProducts().length,
			pageUrl: window.location.href,
			query: queryName,
			sortDirection: sort?.direction ?? null,
			sortField: sort?.field ?? null,
			userAgent: window.navigator.userAgent,
			viewportHeight: window.innerHeight,
			viewportWidth: window.innerWidth,
		};

		captureException(parse(thrownErrorWireSchema, error), context);
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
		if (filters.isSearchMode()) {
			return searchQuery.data?.pages[0]?.pagination.totalCount ?? 0;
		}
		return allBrowseProducts().length;
	});
	const productCountLabel = createMemo(() => {
		if (!filters.isSearchMode() && filters.isBrowsingAll() && props.totalProductCount != null) {
			return `${props.totalProductCount} бүтээгдэхүүн`;
		}
		if (shouldShowEmptyState()) {
			return "0 бүтээгдэхүүн";
		}
		if (filters.isSearchMode() && hasProducts()) {
			return `${productCount()} бүтээгдэхүүн`;
		}
		if (!filters.isSearchMode() && hasProducts() && !productsQuery.hasNextPage) {
			return `${productCount()} бүтээгдэхүүн`;
		}
		return `${productCount()}+ бүтээгдэхүүн`;
	});

	const hasNextPage = () =>
		filters.isSearchMode() ? searchQuery.hasNextPage : productsQuery.hasNextPage;
	const isFetchingNextPage = () =>
		filters.isSearchMode() ? searchQuery.isFetchingNextPage : productsQuery.isFetchingNextPage;
	const loadNextPage = () => {
		if (!hasNextPage() || isFetchingNextPage()) {
			return;
		}
		if (filters.isSearchMode()) {
			void searchQuery.fetchNextPage({ cancelRefetch: false });
		} else {
			void productsQuery.fetchNextPage({ cancelRefetch: false });
		}
	};

	createEffect(() => {
		if (!isLoadMoreInRange() || !hasNextPage()) {
			return;
		}
		loadNextPage();
	});

	const retryProducts = () => {
		if (filters.isSearchMode()) {
			if (searchResults().length > 0 && searchQuery.hasNextPage) {
				loadNextPage();
			} else {
				searchQuery.refetch();
			}
			return;
		}
		if (allBrowseProducts().length > 0 && productsQuery.hasNextPage) {
			loadNextPage();
			return;
		}
		productsQuery.refetch();
	};

	const setupObserver = (element: HTMLButtonElement) => {
		const observer = new IntersectionObserver(
			(entries) => setIsLoadMoreInRange(entries[0].isIntersecting),
			{ rootMargin: "300px 0px", threshold: 0 },
		);

		observer.observe(element);
		onCleanup(() => {
			setIsLoadMoreInRange(false);
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
						"border-border mb-3 flex flex-col gap-1 rounded-2xl border px-4 py-4 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4 sm:px-6 sm:py-5",
						washBg("all-products"),
					)}
				>
					<h1 class="font-display text-lg leading-tight font-bold tracking-tight sm:text-xl lg:text-2xl">
						{filters.pageTitle()}
					</h1>
					<Show
						fallback={
							<div class="bg-muted h-3.5 w-20 animate-pulse rounded sm:h-4 sm:w-24 lg:h-5 lg:w-28" />
						}
						when={!isInitialLoading()}
					>
						<span class="text-foreground/70 text-xs font-medium sm:text-sm lg:text-base">
							{productCountLabel()}
						</span>
					</Show>
				</div>

				{/* Search + filter trigger topbar */}
				<div class="border-border bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-30 -mx-3 mb-3 flex items-center gap-2 border-b px-3 py-2.5 supports-[backdrop-filter]:backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
					<SearchSheet
						contentClass="h-[85vh] w-full max-w-none border-border border-t p-0"
						headerClass="bg-primary/10"
						inputPlaceholder="Омега-3, магни, нойргүйдэл…"
						position="bottom"
						triggerAriaLabel="Хайх"
						triggerClass="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left text-muted-foreground shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.99]"
						triggerContent={
							<>
								<IconSearch aria-hidden="true" class="h-5 w-5 shrink-0" />
								<span class="truncate text-sm font-medium">Хайх...</span>
							</>
						}
					/>
					<button
						aria-label="Шүүлтүүр нээх"
						class="border-border bg-card shadow-soft-sm relative flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
						onClick={(event) => {
							filterSheetFocusRestore.register(event.currentTarget);
							setFilterDrawerOpen(true);
						}}
						type="button"
					>
						<IconEqualizer class="h-4 w-4" />
						<span>Шүүлтүүр</span>
						<Show when={filters.activeFilterCount() > 0}>
							<span class="border-cocoa bg-primary flex size-5 items-center justify-center rounded-full border text-[11px] font-bold">
								{filters.activeFilterCount()}
							</span>
						</Show>
					</button>
				</div>

				<AppliedFilters chips={filters.appliedChips()} onClearAll={filters.handleClearFilters} />

				<FilterDrawer
					brandId={filters.brandId()}
					brands={brandsQuery.data ?? []}
					categories={categoriesQuery.data ?? []}
					categoryId={filters.categoryId()}
					effectiveSearchTerm={filters.effectiveSearchTerm()}
					focusRestore={filterSheetFocusRestore}
					includeOutOfStock={filters.includeOutOfStock()}
					listFilter={filters.listFilter()}
					onApply={filters.applyFilters}
					onOpenChange={setFilterDrawerOpen}
					onReset={filters.resetDrawerFilters}
					open={filterDrawerOpen()}
					priceRange={filters.priceRange()}
					sortDirection={filters.sortDirection()}
					sortField={filters.sortField()}
				/>

				{/* Products Grid */}
				<Show
					fallback={
						<Show
							fallback={
								<Show
									fallback={
										<Show when={shouldShowEmptyState()}>
											<ProductEmptyState
												hasActiveFilters={filters.hasActiveFilters()}
												onClearFilters={filters.handleClearFilters}
											/>
										</Show>
									}
									when={hasInitialBrowseError()}
								>
									<ProductErrorState onRetry={retryProducts} />
								</Show>
							}
							when={isInitialLoading()}
						>
							{/* Initial Loading Skeleton */}
							<ProductSkeletonGrid count={8} />
						</Show>
					}
					when={hasProducts() || isRefetching()}
				>
					{/* Products Grid with refetching overlay */}
					<div class="relative">
						{/* Loading indicator for initial load */}
						<Show when={isInitialLoading()}>
							<div class="bg-background/90 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
								<div class="border-border bg-card shadow-soft sm:shadow-soft-lg flex flex-col items-center gap-3 rounded-lg border px-5 py-4 sm:gap-3.5 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
									<div class="border-border h-6 w-6 animate-spin rounded-full border border-t-transparent sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
									<p class="text-xs font-bold sm:text-sm lg:text-base">Ачааллаж байна...</p>
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
									<For each={searchResults()}>{(product) => <ProductCard product={product} />}</For>
								</div>
							</Show>
							{/* Browse mode: plain CSS grid. Pages are 12 items, so even
							    dozens of loaded pages are a modest DOM size. */}
							<Show when={!filters.isSearchMode()}>
								<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
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

				{/* Loading More Skeleton */}
				<Show when={isFetchingNextPage()}>
					<ProductSkeletonGrid
						class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:mt-6 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
						count={4}
					/>
				</Show>

				{/* End of List */}
				<Show
					when={
						(filters.isSearchMode()
							? searchQuery.data && !searchQuery.hasNextPage
							: productsQuery.data && !productsQuery.hasNextPage) && hasProducts()
					}
				>
					<ProductListEnd count={productCount()} />
				</Show>

				{/* Automatic continuation with an accessible manual fallback. */}
				<Show
					when={hasNextPage() && (filters.isSearchMode() ? searchQuery.data : productsQuery.data)}
				>
					<div class="mt-4 flex justify-center sm:mt-6">
						<button
							class="border-border bg-card shadow-soft-sm hover:shadow-soft inline-flex h-11 min-w-[132px] items-center justify-center rounded-full border px-5 text-sm font-semibold transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
							disabled={isFetchingNextPage()}
							onClick={loadNextPage}
							ref={setupObserver}
							type="button"
						>
							{isFetchingNextPage() ? "Ачааллаж байна..." : "Цааш үзэх"}
						</button>
					</div>
				</Show>
			</div>
		</div>
	);
};

export default ProductsList;
