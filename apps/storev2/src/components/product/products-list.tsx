import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/solid-query";
import { formatCurrency } from "@vit/shared";
import { productSortOptions } from "@vit/shared/domain/product";
import {
	batch,
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { hydrateServerState } from "@/lib/hydration";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { useSearchParam } from "@/lib/useSearchParam";
import { cn } from "@/lib/utils";
import { WASH_BG, washFor } from "@/lib/wash";
import IconEqualizer from "~icons/ri/equalizer-line";
import IconSearch from "~icons/ri/search-line";
import SearchSheet from "../search/search-sheet";
import AppliedFilters from "./applied-filters";
import FilterDrawer, { PRICE_MAX, PRICE_MIN } from "./filter-drawer";
import ProductCard from "./product-card";
import {
	ProductEmptyState,
	ProductErrorState,
	ProductListEnd,
	ProductSkeletonGrid,
} from "./products-list-states";
import { ProductsVirtualGrid } from "./products-virtual-grid";

type ListFilter = "featured" | "recent";
type ProductSortField = "price" | "createdAt";
type ProductSortDirection = "asc" | "desc";
const STORE_VIRTUAL_OVERSCAN_ROWS = 2;
const STORE_DEFAULT_ROW_HEIGHT = 360;

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
	hydrateServerState(queryClient, props.dehydratedState);

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
	const [priceParam, setPriceParam] = useSearchParam("price", {
		defaultValue: undefined,
	});
	const [stockParam, setStockParam] = useSearchParam("stock", {
		defaultValue: undefined,
	});

	const [filterDrawerOpen, setFilterDrawerOpen] = createSignal(false);
	const [lastLoggedProductsError, setLastLoggedProductsError] =
		createSignal<unknown>();

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

	const priceRange = createMemo<[number, number]>(() => {
		const raw = priceParam();
		if (!raw) return [PRICE_MIN, PRICE_MAX];
		const [minStr, maxStr] = raw.split("-");
		const min = Number.parseInt(minStr ?? "", 10);
		const max = Number.parseInt(maxStr ?? "", 10);
		return [
			Number.isNaN(min) ? PRICE_MIN : min,
			Number.isNaN(max) ? PRICE_MAX : max,
		];
	});

	const minPrice = createMemo(() => {
		const value = priceRange()[0];
		return value <= PRICE_MIN ? undefined : value;
	});

	const maxPrice = createMemo(() => {
		const value = priceRange()[1];
		return value >= PRICE_MAX ? undefined : value;
	});

	const inStockOnly = createMemo(() => stockParam() === "instock");
	const includeOutOfStock = createMemo(() => !inStockOnly());

	const searchQuery = useQuery(
		() => ({
			queryKey: ["search-products-page", searchTerm(), categoryId(), brandId()],
			queryFn: async () => {
				const term = searchTerm();
				if (!term || term.length < 2) return [];
				return await api.product.searchProductsForPage.query({
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
				minPrice(),
				maxPrice(),
				includeOutOfStock(),
			],
			queryFn: async ({ pageParam }) => {
				const sort = selectedSort();
				const params = {
					cursor: pageParam,
					limit: 12,
					listType: listFilter() ?? undefined,
					sortField: sort?.field,
					sortDirection: sort?.direction,
					categoryId: categoryId() ?? undefined,
					brandId: brandId() ?? undefined,
					minPrice: minPrice(),
					maxPrice: maxPrice(),
				};
				const result = includeOutOfStock()
					? await api.product.getInfiniteProducts.query(params)
					: await api.product.getInfiniteProductsWithStock.query(params);
				return result;
			},
			initialPageParam: undefined as string | undefined,
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

		if (gridWidth() === 0) return { start: 0, end: browseRows().length };

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
			!sortField() &&
			minPrice() === undefined &&
			maxPrice() === undefined &&
			!inStockOnly(),
	);

	const writePrice = (range: [number, number]) => {
		if (range[0] <= PRICE_MIN && range[1] >= PRICE_MAX) {
			setPriceParam(null);
			return;
		}
		setPriceParam(`${range[0]}-${range[1]}`);
	};

	const applyFilters = (next: {
		sortField: string | null;
		sortDirection: string | null;
		categoryId: number | null;
		brandId: number | null;
		priceRange: [number, number];
		includeOutOfStock: boolean;
	}) => {
		const validSort =
			(next.sortField === "price" || next.sortField === "createdAt") &&
			(next.sortDirection === "asc" || next.sortDirection === "desc");
		batch(() => {
			setSortField(validSort ? next.sortField : null);
			setSortDirection(validSort ? next.sortDirection : null);
			setCategoryIdParam(next.categoryId?.toString() ?? null);
			setBrandIdParam(next.brandId?.toString() ?? null);
			writePrice(next.priceRange);
			setStockParam(next.includeOutOfStock ? null : "instock");
		});
	};

	const resetDrawerFilters = () => {
		batch(() => {
			setSortField(null);
			setSortDirection(null);
			setCategoryIdParam(null);
			setBrandIdParam(null);
			setPriceParam(null);
			setStockParam(null);
		});
	};

	const removeSort = () => {
		batch(() => {
			setSortField(null);
			setSortDirection(null);
		});
	};

	const handleClearFilters = () => {
		batch(() => {
			setSearchTerm(null);
			setSortField(null);
			setSortDirection(null);
			setCategoryIdParam(null);
			setBrandIdParam(null);
			setListFilterParam(null);
			setPriceParam(null);
			setStockParam(null);
		});
	};

	const priceLabel = createMemo(() => {
		const [min, max] = priceRange();
		if (min > PRICE_MIN && max < PRICE_MAX) {
			return `${formatCurrency(min)}–${formatCurrency(max)}`;
		}
		if (max < PRICE_MAX) return `≤ ${formatCurrency(max)}`;
		return `≥ ${formatCurrency(min)}`;
	});

	const activeFilterCount = createMemo(() => {
		let count = 0;
		if (categoryId()) count += 1;
		if (brandId()) count += 1;
		if (minPrice() !== undefined || maxPrice() !== undefined) count += 1;
		if (selectedSort()) count += 1;
		if (listFilter()) count += 1;
		if (inStockOnly()) count += 1;
		return count;
	});

	const categoryLabel = createMemo(
		() =>
			categoriesQuery.data?.find(
				(c: { id: number; name: string }) => c.id === categoryId(),
			)?.name ?? null,
	);
	const brandLabel = createMemo(
		() =>
			brandsQuery.data?.find(
				(b: { id: number; name: string }) => b.id === brandId(),
			)?.name ?? null,
	);
	const sortLabel = createMemo(() => {
		const sort = selectedSort();
		if (!sort) return null;
		return (
			productSortOptions.find(
				(o) => o.field === sort.field && o.direction === sort.direction,
			)?.label ?? null
		);
	});
	const presetLabel = createMemo(() => {
		const preset = listFilter();
		return preset ? LIST_FILTER_LABELS[preset] : null;
	});
	const priceChipLabel = createMemo(() =>
		minPrice() !== undefined || maxPrice() !== undefined ? priceLabel() : null,
	);
	const stockLabel = createMemo(() =>
		inStockOnly() ? "Зөвхөн нөөцтэй" : null,
	);

	const appliedChips = createMemo(() =>
		[
			{
				key: "search",
				label: searchTerm(),
				onRemove: () => setSearchTerm(null),
			},
			{
				key: "category",
				label: categoryLabel(),
				onRemove: () => setCategoryIdParam(null),
			},
			{
				key: "brand",
				label: brandLabel(),
				onRemove: () => setBrandIdParam(null),
			},
			{
				key: "price",
				label: priceChipLabel(),
				onRemove: () => setPriceParam(null),
			},
			{ key: "sort", label: sortLabel(), onRemove: removeSort },
			{
				key: "preset",
				label: presetLabel(),
				onRemove: () => setListFilterParam(null),
			},
			{
				key: "stock",
				label: stockLabel(),
				onRemove: () => setStockParam(null),
			},
		].filter(
			(chip): chip is { key: string; label: string; onRemove: () => void } =>
				chip.label != null && chip.label !== "",
		),
	);

	const hasActiveFilters = () =>
		!!searchTerm() ||
		!!selectedSort() ||
		!!categoryId() ||
		!!brandId() ||
		!!listFilter() ||
		minPrice() !== undefined ||
		maxPrice() !== undefined ||
		inStockOnly();

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
						onClick={() => setFilterDrawerOpen(true)}
						aria-label="Шүүлтүүр нээх"
						class="relative flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 font-bold text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
					>
						<IconEqualizer class="h-4 w-4" />
						<span>Шүүлтүүр</span>
						<Show when={activeFilterCount() > 0}>
							<span class="flex size-5 items-center justify-center rounded-full border border-cocoa bg-primary font-bold text-[11px]">
								{activeFilterCount()}
							</span>
						</Show>
					</button>
				</div>

				<AppliedFilters
					chips={appliedChips()}
					onClearAll={handleClearFilters}
				/>

				<FilterDrawer
					open={filterDrawerOpen()}
					onOpenChange={setFilterDrawerOpen}
					categories={categoriesQuery.data ?? []}
					brands={brandsQuery.data ?? []}
					sortField={sortField()}
					sortDirection={sortDirection()}
					categoryId={categoryId()}
					brandId={brandId()}
					priceRange={priceRange()}
					inStockOnly={!includeOutOfStock()}
					includeOutOfStock={includeOutOfStock()}
					onApply={applyFilters}
					onReset={resetDrawerFilters}
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
					<ProductErrorState
						onRetry={() => {
							if (isSearchMode()) {
								searchQuery.refetch();
							} else {
								productsQuery.refetch();
							}
						}}
					/>
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
