import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/solid-query";
import type { ProductCardData } from "@vit/shared/types";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { useSearchParam } from "@/lib/useSearchParam";
import { cn } from "@/lib/utils";
import { WASH_BG, washFor } from "@/lib/wash";
import FilterBar from "../search/filter-bar";
import {
	ProductEmptyState,
	ProductErrorState,
	ProductListEnd,
	ProductSkeletonGrid,
} from "./products-list-states";
import { ProductsVirtualGrid } from "./products-virtual-grid";
import ProductCard from "./product-card";

type ListFilter = "featured" | "recent";
type ProductSortField = "price" | "createdAt";
type ProductSortDirection = "asc" | "desc";
const STORE_VIRTUAL_OVERSCAN_ROWS = 2;
const STORE_DEFAULT_ROW_HEIGHT = 360;

type InfiniteProductsResult = {
	items: ProductCardData[];
	nextCursor: string | null;
};

type FilterOption = {
	id: number;
	name: string;
	slug: string;
};

type ProductsListProps = {
	initialProductsResult: InfiniteProductsResult;
	initialCategories?: FilterOption[];
	initialBrands?: FilterOption[];
	totalProductCount?: number;
};

const LIST_FILTER_LABELS: Record<ListFilter, string> = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
};

const getStoreProductColumns = (width: number) => {
	if (width >= 1280) return 4;
	if (width >= 1024) return 3;
	return 2;
};

const chunkItems = <T,>(items: T[], chunkSize: number) => {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize));
	}
	return chunks;
};

const getErrorDetails = (error: unknown) => {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		name: typeof error,
		message: String(error),
	};
};

const ProductsList = (props: ProductsListProps) => {
	// URL search params for filters
	const [searchTerm, setSearchTerm] = useSearchParam("q", {
		defaultValue: undefined,
	});
	const [sortField, setSortField] = useSearchParam("sort", {
		defaultValue: undefined,
	});
	const [sortDirection, setSortDirection] = useSearchParam("dir", {
		defaultValue: undefined,
	});
	const [categoryIdParam, setCategoryIdParam] = useSearchParam("category", {
		defaultValue: undefined,
	});
	const [brandIdParam, setBrandIdParam] = useSearchParam("brand", {
		defaultValue: undefined,
	});
	const [listFilterParam, setListFilterParam] = useSearchParam("filter", {
		defaultValue: undefined,
	});

	const [localSearchTerm, setLocalSearchTerm] = createSignal(
		searchTerm() ?? "",
	);
	const [lastLoggedProductsError, setLastLoggedProductsError] =
		createSignal<unknown>();

	createEffect(() => {
		setLocalSearchTerm(searchTerm() ?? "");
	});

	const isSearchMode = createMemo(() => {
		const term = searchTerm();
		return term !== undefined && term !== null && term.length >= 2;
	});

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

	const listFilter = createMemo<ListFilter | null>(() => {
		const val = listFilterParam();
		if (val === "featured" || val === "recent") {
			return val;
		}
		return null;
	});

	const categoryId = createMemo(() => {
		const val = categoryIdParam();
		if (!val) return null;

		const parsed = Number.parseInt(val, 10);
		if (!Number.isNaN(parsed)) return parsed;

		const categoryByName = categoriesQuery.data?.find(
			(c: { id: number; name: string }) =>
				c.name.trim().toLowerCase() === val.trim().toLowerCase(),
		);

		return categoryByName?.id ?? null;
	});

	const brandId = createMemo(() => {
		const val = brandIdParam();
		if (!val) return null;

		const parsed = Number.parseInt(val, 10);
		if (!Number.isNaN(parsed)) return parsed;

		const brandByName = brandsQuery.data?.find(
			(b: { id: number; name: string }) =>
				b.name.trim().toLowerCase() === val.trim().toLowerCase(),
		);

		return brandByName?.id ?? null;
	});

	const searchQuery = useQuery(
		() => ({
			queryKey: ["search-products-page", searchTerm(), categoryId(), brandId()],
			queryFn: async () => {
				const term = searchTerm();
				if (!term || term.length < 2) return [];
				return await api.product.searchProductsForPageWithStock.query({
					query: term,
					limit: 10,
					categoryId: categoryId() ?? undefined,
					brandId: brandId() ?? undefined,
				});
			},
			enabled: isSearchMode(),
			staleTime: 1000 * 60 * 5, // 5 minutes
			placeholderData: keepPreviousData,
		}),
		() => queryClient,
	);

	const selectedSort = createMemo<{
		field: ProductSortField;
		direction: ProductSortDirection;
	} | null>(() => {
		const field = sortField();
		const direction = sortDirection();
		if (
			(field === "price" || field === "createdAt") &&
			(direction === "asc" || direction === "desc")
		) {
			return { field, direction };
		}
		return null;
	});

	createEffect(() => {
		if ((sortField() || sortDirection()) && !selectedSort()) {
			setSortField(null);
			setSortDirection(null);
		}
	});

	const productsQuery = useInfiniteQuery(
		() => ({
			queryKey: [
				"products-browse",
				selectedSort()?.field,
				selectedSort()?.direction,
				categoryId(),
				brandId(),
				listFilter(),
			],
			queryFn: async ({ pageParam }) => {
				const sort = selectedSort();
				const result = await api.product.getInfiniteProductsWithStock.query({
					cursor: pageParam,
					limit: 12,
					listType: listFilter() ?? undefined,
					sortField: sort?.field,
					sortDirection: sort?.direction,
					categoryId: categoryId() ?? undefined,
					brandId: brandId() ?? undefined,
				});
				return result;
			},
			initialPageParam: undefined as string | undefined,
			initialData: {
				pages: [props.initialProductsResult],
				pageParams: [undefined as string | undefined],
			},
			initialDataUpdatedAt:
				selectedSort() || categoryId() || brandId() || listFilter()
					? 0
					: Date.now(),
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			placeholderData: keepPreviousData,
			enabled: !isSearchMode(),
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
		if (isSearchMode()) return isSearchLoading();
		return productsQuery.isLoading && !productsQuery.data;
	});

	const isRefetching = createMemo(() => {
		if (isSearchMode()) return isSearchRefetching();
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
	let browseGridRef: HTMLDivElement | undefined;
	let layoutRafId: number | undefined;
	const [gridWidth, setGridWidth] = createSignal(0);
	const [gridTop, setGridTop] = createSignal(0);
	const [viewportTop, setViewportTop] = createSignal(0);
	const [viewportHeight, setViewportHeight] = createSignal(0);
	const [rowHeight, setRowHeight] = createSignal(STORE_DEFAULT_ROW_HEIGHT);
	const [firstBrowseRowEl, setFirstBrowseRowEl] =
		createSignal<HTMLDivElement>();

	const columnCount = createMemo(() =>
		getStoreProductColumns(gridWidth() || 1280),
	);
	const browseRows = createMemo(() =>
		chunkItems(allBrowseProducts(), columnCount()),
	);
	const totalBrowseHeight = createMemo(() => browseRows().length * rowHeight());
	const visibleBrowseRange = createMemo(() => {
		if (browseRows().length === 0) return { start: 0, end: 0 };

		const overscan = rowHeight() * STORE_VIRTUAL_OVERSCAN_ROWS;
		const start = Math.max(
			0,
			Math.floor((viewportTop() - gridTop() - overscan) / rowHeight()),
		);
		const end = Math.min(
			browseRows().length,
			Math.ceil(
				(viewportTop() + viewportHeight() - gridTop() + overscan) / rowHeight(),
			),
		);

		return { start, end: Math.max(start + 1, end) };
	});
	const visibleBrowseRows = createMemo(() =>
		browseRows().slice(visibleBrowseRange().start, visibleBrowseRange().end),
	);

	const hasProducts = createMemo(() => {
		if (isSearchMode()) return searchResults().length > 0;
		return allBrowseProducts().length > 0;
	});

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
		const sort = selectedSort();
		const details = getErrorDetails(error);
		const context = {
			...details,
			component: "ProductsList",
			query: "product.getInfiniteProducts",
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
			categoryId: categoryId(),
			brandId: brandId(),
			listFilter: listFilter(),
		};

		console.error("[ProductsList] Infinite products query failed", context);
	});

	const shouldShowEmptyState = createMemo(() => {
		if (isSearchMode()) {
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
		if (isSearchMode()) return searchResults().length;
		return allBrowseProducts().length;
	});

	// True when browsing the full catalog with no filter/search/category/brand
	// active — in that case the SSR totalProductCount is the authoritative count.
	const isBrowsingAll = createMemo(
		() =>
			!isSearchMode() &&
			!categoryId() &&
			!brandId() &&
			!listFilter() &&
			!sortField(),
	);

	const handleSearch = (term: string) => {
		setLocalSearchTerm(term);
		setSearchTerm(term || null);
	};

	const handleSortChange = (field: string | null, direction: string | null) => {
		if (
			(field === "price" || field === "createdAt") &&
			(direction === "asc" || direction === "desc")
		) {
			setSortField(field);
			setSortDirection(direction);
			return;
		}
		setSortField(null);
		setSortDirection(null);
	};

	const handleCategoryChange = (id: number | null) => {
		if (!id) {
			setCategoryIdParam(null);
			return;
		}
		const category = categoriesQuery.data?.find(
			(c: { id: number; slug: string }) => c.id === id,
		);
		if (category?.slug) {
			window.location.href = `/products/category/${category.slug}/1/`;
		} else {
			setCategoryIdParam(id?.toString() ?? null);
		}
	};

	const handleBrandChange = (id: number | null) => {
		if (!id) {
			setBrandIdParam(null);
			return;
		}
		const brand = brandsQuery.data?.find(
			(b: { id: number; slug: string }) => b.id === id,
		);
		if (brand?.slug) {
			window.location.href = `/products/brand/${brand.slug}/1/`;
		} else {
			setBrandIdParam(id?.toString() ?? null);
		}
	};

	const handleClearFilters = () => {
		setSearchTerm(null);
		setSortField(null);
		setSortDirection(null);
		setCategoryIdParam(null);
		setBrandIdParam(null);
		setListFilterParam(null);
		setLocalSearchTerm("");
	};

	const hasActiveFilters = () =>
		!!searchTerm() ||
		!!selectedSort() ||
		!!categoryId() ||
		!!brandId() ||
		!!listFilter();

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

	const updateVirtualLayout = () => {
		setGridWidth(browseGridRef?.clientWidth ?? window.innerWidth);
		setGridTop(
			browseGridRef
				? window.scrollY + browseGridRef.getBoundingClientRect().top
				: 0,
		);
		setViewportTop(window.scrollY);
		setViewportHeight(window.innerHeight);
	};

	onMount(() => {
		document.getElementById("products-ssr")?.remove();
		updateVirtualLayout();

		const handleWindowChange = () => {
			if (layoutRafId !== undefined) return;
			layoutRafId = window.requestAnimationFrame(() => {
				layoutRafId = undefined;
				updateVirtualLayout();
			});
		};

		const resizeObserver = new ResizeObserver(() => updateVirtualLayout());
		if (browseGridRef) resizeObserver.observe(browseGridRef);

		window.addEventListener("scroll", handleWindowChange, { passive: true });
		window.addEventListener("resize", handleWindowChange);

		onCleanup(() => {
			if (layoutRafId !== undefined) {
				window.cancelAnimationFrame(layoutRafId);
			}
			resizeObserver.disconnect();
			window.removeEventListener("scroll", handleWindowChange);
			window.removeEventListener("resize", handleWindowChange);
		});
	});

	createEffect(() => {
		const row = firstBrowseRowEl();
		if (!row) return;

		const updateHeight = () => {
			const nextHeight = row.getBoundingClientRect().height;
			if (nextHeight > 0 && Math.abs(nextHeight - rowHeight()) > 1) {
				setRowHeight(nextHeight);
			}
		};

		updateHeight();
		const resizeObserver = new ResizeObserver(() => updateHeight());
		resizeObserver.observe(row);

		onCleanup(() => resizeObserver.disconnect());
	});

	// Get active filter display text
	const getPageTitle = () => {
		if (searchTerm()) return `"${searchTerm()}" хайлтын үр дүн`;
		if (listFilter()) return LIST_FILTER_LABELS[listFilter() as ListFilter];
		if (categoryId()) {
			const cat = categoriesQuery.data?.find(
				(c: { id: number; name: string }) => c.id === categoryId(),
			);
			if (cat) return cat.name;
		}
		if (brandId()) {
			const brand = brandsQuery.data?.find(
				(b: { id: number; name: string }) => b.id === brandId(),
			);
			if (brand) return brand.name;
		}
		return "Бүх бүтээгдэхүүн";
	};

	return (
		<div class="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
			<div>
				{/* Compact Header on wash tint */}
				<div
					class={cn(
						"mb-3 flex flex-col gap-1 rounded-2xl border border-border px-4 py-4 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4 sm:px-6 sm:py-5",
						WASH_BG[washFor("all-products")],
					)}
				>
					<h1 class="font-bold font-display text-lg leading-tight tracking-tight sm:text-xl lg:text-2xl">
						{getPageTitle()}
					</h1>
					<Show
						when={!isInitialLoading()}
						fallback={
							<div class="h-3.5 w-20 animate-pulse rounded bg-muted sm:h-4 sm:w-24 lg:h-5 lg:w-28" />
						}
					>
						<span class="font-medium text-foreground/70 text-xs sm:text-sm lg:text-base">
							<Show
								when={hasProducts()}
								fallback={
									shouldShowEmptyState()
										? "0 бүтээгдэхүүн"
										: `${productCount()}+ бүтээгдэхүүн`
								}
							>
								<Show
									when={isSearchMode()}
									fallback={
										isBrowsingAll() && props.totalProductCount != null
											? `${props.totalProductCount} бүтээгдэхүүн`
											: productsQuery.hasNextPage
												? `${productCount()}+ бүтээгдэхүүн`
												: `${productCount()} бүтээгдэхүүн`
									}
								>
									{`${productCount()} бүтээгдэхүүн`}
								</Show>
							</Show>
						</span>
					</Show>
				</div>

				{/* Filter Bar */}
				<FilterBar
					searchTerm={localSearchTerm()}
					sortField={sortField()}
					sortDirection={sortDirection()}
					categoryId={categoryId()}
					brandId={brandId()}
					categories={categoriesQuery.data ?? []}
					brands={brandsQuery.data ?? []}
					onSearchChange={handleSearch}
					onSortChange={handleSortChange}
					onCategoryChange={handleCategoryChange}
					onBrandChange={handleBrandChange}
					presetFilter={listFilter()}
					onPresetFilterChange={(value: ListFilter | null) =>
						setListFilterParam(value)
					}
					onClearFilters={handleClearFilters}
					hasActiveFilters={hasActiveFilters()}
				/>

				{/* Products Grid */}
				<Show
					when={hasProducts() || isRefetching()}
					fallback={
						<Show
							when={isInitialLoading()}
							fallback={
								<Show when={shouldShowEmptyState()}>
									<ProductEmptyState
										hasActiveFilters={hasActiveFilters()}
										onClearFilters={handleClearFilters}
									/>
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
							<Show when={isSearchMode()}>
								<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
									<For each={searchResults()}>
										{(product) => <ProductCard product={product} />}
									</For>
								</div>
							</Show>
							{/* Browse mode: render infinite scroll products */}
							<Show when={!isSearchMode()}>
								<ProductsVirtualGrid
									rows={visibleBrowseRows()}
									rangeStart={visibleBrowseRange().start}
									rowHeight={rowHeight()}
									totalHeight={totalBrowseHeight()}
									setGridRef={(el) => {
										browseGridRef = el;
									}}
									setFirstRowRef={setFirstBrowseRowEl}
								/>
							</Show>
						</div>
					</div>
				</Show>

				{/* Error State */}
				<Show
					when={isSearchMode() ? searchQuery.isError : productsQuery.isError}
				>
					<ProductErrorState onRetry={() => {
						if (isSearchMode()) {
							searchQuery.refetch();
						} else {
							productsQuery.refetch();
						}
					}} />
				</Show>

				{/* Loading More Skeleton (browse mode only) */}
				<Show when={!isSearchMode() && productsQuery.isFetchingNextPage}>
					<ProductSkeletonGrid
						count={4}
						class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:mt-6 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
					/>
				</Show>

				{/* End of List */}
				<Show
					when={
						isSearchMode()
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
						!isSearchMode() &&
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
