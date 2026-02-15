import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/solid-query";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { useSearchParam } from "@/lib/useSearchParam";
import { cn } from "@/lib/utils";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconSearch from "~icons/ri/search-line";
import IconSparkle from "~icons/ri/sparkling-fill";
import FilterBar from "../search/filter-bar";
import ProductCard from "./product-card";
import SearchProductCard from "./search-product-card";

type ListFilter = "featured" | "recent" | "discount";

const LIST_FILTER_LABELS: Record<ListFilter, string> = {
	featured: "Онцлох",
	recent: "Шинэ ирсэн",
	discount: "Хямдралтай",
};

const ProductCardSkeleton = () => (
	<div class="flex animate-pulse flex-col border-2 border-black bg-white shadow-[2px_2px_0_0_#000] transition-all sm:border-3 sm:shadow-[3px_3px_0_0_#000] lg:shadow-[5px_5px_0_0_#000]">
		<div class="relative aspect-4/5 overflow-hidden border-black border-b-2 bg-gray-100 sm:aspect-4/3 sm:border-b-3">
			<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.05)_2px,transparent_0)] bg-size-[14px_14px]" />
			<div class="absolute right-1.5 bottom-1.5 h-3 w-10 border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:right-2 sm:bottom-2 sm:h-4 sm:w-12 lg:right-3 lg:bottom-3 lg:h-5 lg:w-16" />
		</div>
		<div class="flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-2.5 lg:gap-2 lg:p-3">
			<div class="h-3 w-full rounded bg-gray-200 sm:h-3.5 lg:h-4" />
			<div class="h-3 w-3/4 rounded bg-gray-200 sm:h-3.5 lg:h-4" />
		</div>
		<div class="flex items-center justify-between border-black border-t-2 bg-primary/10 px-2 py-1.5 sm:border-t-3 sm:px-2.5 sm:py-2 lg:px-3 lg:py-2.5">
			<div class="h-3.5 w-14 rounded bg-gray-200 sm:h-4 sm:w-16 lg:h-5 lg:w-20" />
			<div class="h-7 w-9 border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:h-8 sm:w-11 lg:h-9 lg:w-14" />
		</div>
	</div>
);

const ProductsList = () => {
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
			queryFn: () => api.category.getAllCategories.query(),
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const brandsQuery = useQuery(
		() => ({
			queryKey: ["brands"],
			queryFn: () => api.brand.getAllBrands.query(),
			staleTime: 1000 * 60 * 10, // 10 minutes
		}),
		() => queryClient,
	);

	const listFilter = createMemo<ListFilter | null>(() => {
		const val = listFilterParam();
		if (val === "featured" || val === "recent" || val === "discount") {
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
			queryKey: ["search-products-page", searchTerm()],
			queryFn: async () => {
				const term = searchTerm();
				if (!term || term.length < 2) return [];
				return await api.product.searchProductsForPage.query({
					query: term,
					limit: 50,
				});
			},
			enabled: isSearchMode(),
			staleTime: 1000 * 60 * 5, // 5 minutes
			placeholderData: keepPreviousData,
		}),
		() => queryClient,
	);

	const productsQuery = useInfiniteQuery(
		() => ({
			queryKey: [
				"products-browse",
				sortField(),
				sortDirection(),
				categoryId(),
				brandId(),
				listFilter(),
			],
			queryFn: async ({ pageParam }) => {
				const result = await api.product.getInfiniteProducts.query({
					cursor: pageParam,
					limit: 12,
					listType: listFilter() ?? undefined,
					sortField:
						(sortField() as "price" | "stock" | "createdAt") || undefined,
					sortDirection: (sortDirection() as "asc" | "desc") || undefined,
					categoryId: categoryId() ?? undefined,
					brandId: brandId() ?? undefined,
				});
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

	const hasProducts = createMemo(() => {
		if (isSearchMode()) return searchResults().length > 0;
		return allBrowseProducts().length > 0;
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

	const handleSearch = (term: string) => {
		setLocalSearchTerm(term);
		setSearchTerm(term || null);
	};

	const handleSortChange = (field: string | null, direction: string | null) => {
		setSortField(field);
		setSortDirection(direction);
	};

	const handleCategoryChange = (id: number | null) => {
		setCategoryIdParam(id?.toString() ?? null);
	};

	const handleBrandChange = (id: number | null) => {
		setBrandIdParam(id?.toString() ?? null);
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
		!!sortField() ||
		!!sortDirection() ||
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
			<div class="overflow-hidden border-2 border-black bg-primary/5 px-3 py-3 shadow-[3px_3px_0_0_#000] sm:border-4 sm:px-5 sm:py-4 sm:shadow-[6px_6px_0_0_#000]">
				{/* Compact Header */}
				<div class="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4 sm:gap-y-1.5">
					<h1 class="font-black text-lg leading-tight tracking-tight sm:text-xl lg:text-2xl">
						{getPageTitle()}
					</h1>
					<Show
						when={!isInitialLoading()}
						fallback={
							<div class="h-3.5 w-20 animate-pulse rounded bg-gray-200 sm:h-4 sm:w-24 lg:h-5 lg:w-28" />
						}
					>
						<span class="font-bold text-black/60 text-xs sm:text-sm lg:text-base">
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
										productsQuery.hasNextPage
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
									{/* Empty State */}
									<div class="py-8 text-center sm:py-10 lg:py-14">
										<div class="mb-3 flex justify-center sm:mb-4 lg:mb-5">
											<IconSearch class="h-12 w-12 text-black/20 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
										</div>
										<Show
											when={hasActiveFilters()}
											fallback={
												<>
													<h3 class="mb-2 font-black text-base sm:mb-2.5 sm:text-lg lg:text-xl">
														Бүтээгдэхүүн олдсонгүй
													</h3>
													<p class="px-4 text-black/60 text-xs sm:text-sm lg:text-base">
														Одоогоор бүтээгдэхүүн байхгүй байна
													</p>
												</>
											}
										>
											<h3 class="mb-2 font-black text-base sm:mb-2.5 sm:text-lg lg:text-xl">
												Үр дүн олдсонгүй
											</h3>
											<p class="mb-4 px-4 text-black/60 text-xs sm:mb-5 sm:text-sm lg:mb-6 lg:text-base">
												Таны шүүлтүүрт тохирох бүтээгдэхүүн олдсонгүй.
												Шүүлтүүрээ өөрчилж үзнэ үү.
											</p>
											<button
												type="button"
												onClick={handleClearFilters}
												class="mx-auto min-h-[44px] border-2 border-black bg-primary px-4 py-2.5 font-bold text-xs uppercase shadow-[2px_2px_0_0_#000] transition-all active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_0_#000] sm:px-5 sm:py-3 sm:text-sm lg:px-6 lg:py-3.5 lg:text-base"
											>
												Бүх шүүлтүүр цэвэрлэх
											</button>
										</Show>
									</div>
								</Show>
							}
						>
							{/* Initial Loading Skeleton */}
							<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
								<For each={Array(8)}>{() => <ProductCardSkeleton />}</For>
							</div>
						</Show>
					}
				>
					{/* Products Grid with refetching overlay */}
					<div class="relative">
						{/* Loading indicator for initial load */}
						<Show when={isInitialLoading()}>
							<div class="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-sm">
								<div class="flex flex-col items-center gap-3 border-2 border-black bg-white px-5 py-4 shadow-[3px_3px_0_0_#000] sm:gap-3.5 sm:border-3 sm:px-6 sm:py-5 sm:shadow-[4px_4px_0_0_#000] lg:px-8 lg:py-6">
									<div class="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent sm:h-7 sm:w-7 sm:border-3 lg:h-8 lg:w-8" />
									<p class="font-bold text-xs sm:text-sm lg:text-base">
										Ачааллаж байна...
									</p>
								</div>
							</div>
						</Show>
						<div
							class={cn(
								"grid grid-cols-2 gap-2 transition-opacity duration-200 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4",
								isRefetching() && "pointer-events-none opacity-50",
							)}
						>
							{/* Search mode: render search results */}
							<Show when={isSearchMode()}>
								<For each={searchResults()}>
									{(product) => <SearchProductCard product={product} />}
								</For>
							</Show>
							{/* Browse mode: render infinite scroll products */}
							<Show when={!isSearchMode()}>
								<For each={allBrowseProducts()}>
									{(product) => <ProductCard product={product} />}
								</For>
							</Show>
						</div>
					</div>
				</Show>

				{/* Error State */}
				<Show
					when={isSearchMode() ? searchQuery.isError : productsQuery.isError}
				>
					<div class="py-8 text-center sm:py-10">
						<div class="mb-3 flex justify-center sm:mb-4">
							<IconErrorWarning class="h-10 w-10 text-destructive sm:h-12 sm:w-12" />
						</div>
						<p class="font-bold text-base text-destructive sm:text-lg">
							Алдаа гарлаа
						</p>
						<p class="mt-1 text-black/60 text-xs sm:text-sm">
							Дахин оролдох уу?
						</p>
					</div>
				</Show>

				{/* Loading More Skeleton (browse mode only) */}
				<Show when={!isSearchMode() && productsQuery.isFetchingNextPage}>
					<div class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:mt-6 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
						<For each={Array(4)}>{() => <ProductCardSkeleton />}</For>
					</div>
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
					<div class="mt-4 py-4 text-center sm:mt-6 sm:py-5 lg:mt-8 lg:py-6">
						<span class="flex items-center justify-center gap-2 font-bold text-black/50 text-xs uppercase tracking-wide sm:text-sm lg:text-base">
							<IconSparkle class="text-yellow-500" /> Нийт {productCount()}{" "}
							бүтээгдэхүүн
						</span>
					</div>
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
