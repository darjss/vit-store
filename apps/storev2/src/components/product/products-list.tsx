import { useInfiniteQuery, useQuery } from "@tanstack/solid-query";
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
import FilterBar from "../search/filter-bar";
import ProductCard from "./product-card";

// Loading skeleton component
const ProductCardSkeleton = () => (
	<div class="flex animate-pulse flex-col border-2 border-black bg-white shadow-[3px_3px_0_0_#000] sm:border-3 sm:shadow-[5px_5px_0_0_#000]">
		<div class="relative aspect-4/5 overflow-hidden border-black border-b-2 bg-gray-100 sm:aspect-4/3 sm:border-b-3">
			<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.05)_2px,transparent_0)] bg-size-[14px_14px]" />
			<div class="absolute right-1.5 bottom-1.5 h-4 w-12 border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:right-3 sm:bottom-3 sm:h-5 sm:w-16" />
		</div>
		<div class="flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3">
			<div class="h-3 w-full rounded bg-gray-200 sm:h-4" />
			<div class="h-3 w-3/4 rounded bg-gray-200 sm:h-4" />
		</div>
		<div class="flex items-center justify-between border-black border-t-2 bg-primary/10 px-2 py-1.5 sm:border-t-3 sm:px-3 sm:py-2">
			<div class="h-4 w-16 rounded bg-gray-200 sm:h-5 sm:w-20" />
			<div class="h-7 w-10 border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:h-8 sm:w-12" />
		</div>
	</div>
);

const ProductsList = () => {
	// URL search params for filters
	const [cursor, setCursor] = useSearchParam("cursor", {
		defaultValue: undefined,
		skipTransition: true,
	});
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

	// Local state for search input
	const [localSearchTerm, setLocalSearchTerm] = createSignal(
		searchTerm() ?? "",
	);

	// Sync local search with URL param changes
	createEffect(() => {
		setLocalSearchTerm(searchTerm() ?? "");
	});

	// Fetch categories and brands for filters
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

	// Parse numeric params
	const categoryId = createMemo(() => {
		const val = categoryIdParam();
		return val ? Number.parseInt(val, 10) : null;
	});

	const brandId = createMemo(() => {
		const val = brandIdParam();
		return val ? Number.parseInt(val, 10) : null;
	});

	// Products infinite query
	const productsQuery = useInfiniteQuery(
		() => ({
			queryKey: [
				"products",
				searchTerm(),
				sortField(),
				sortDirection(),
				categoryId(),
				brandId(),
			],
			queryFn: async ({ pageParam }) => {
				return await api.product.getInfiniteProducts.query({
					cursor: pageParam ?? cursor() ?? undefined,
					limit: 12,
					searchTerm: searchTerm() || undefined,
					sortField:
						(sortField() as "price" | "stock" | "createdAt") || undefined,
					sortDirection: (sortDirection() as "asc" | "desc") || undefined,
					categoryId: categoryId() ?? undefined,
					brandId: brandId() ?? undefined,
				});
			},
			initialPageParam: (cursor() ?? undefined) as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		}),
		() => queryClient,
	);

	// Flatten all pages into a single array
	const allProducts = createMemo(() => {
		if (!productsQuery.data) return [];
		return productsQuery.data.pages.flatMap((page) => page.items);
	});

	// Filter handlers
	const handleSearch = (term: string) => {
		setLocalSearchTerm(term);
		setCursor(null);
		setSearchTerm(term || null);
	};

	const handleSortChange = (field: string | null, direction: string | null) => {
		setCursor(null);
		setSortField(field);
		setSortDirection(direction);
	};

	const handleCategoryChange = (id: number | null) => {
		setCursor(null);
		setCategoryIdParam(id?.toString() ?? null);
	};

	const handleBrandChange = (id: number | null) => {
		setCursor(null);
		setBrandIdParam(id?.toString() ?? null);
	};

	const handleClearFilters = () => {
		setCursor(null);
		setSearchTerm(null);
		setSortField(null);
		setSortDirection(null);
		setCategoryIdParam(null);
		setBrandIdParam(null);
		setLocalSearchTerm("");
	};

	// Check if any filters are active
	const hasActiveFilters = () =>
		!!searchTerm() ||
		!!sortField() ||
		!!sortDirection() ||
		!!categoryId() ||
		!!brandId();

	// Scroll position tracking for restoration
	let scrollRestored = false;

	onMount(() => {
		if (typeof window === "undefined") return;

		let scrollTimeout: number | undefined;
		const handleScroll = () => {
			if (scrollTimeout) clearTimeout(scrollTimeout);
			scrollTimeout = window.setTimeout(() => {
				const urlCursor = cursor();
				if (urlCursor) {
					sessionStorage.setItem(
						`products-scroll-${urlCursor}`,
						window.scrollY.toString(),
					);
				}
			}, 150);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });

		onCleanup(() => {
			window.removeEventListener("scroll", handleScroll);
			if (scrollTimeout) clearTimeout(scrollTimeout);
		});
	});

	// Restore scroll position
	createEffect(() => {
		if (typeof window === "undefined") return;
		if (scrollRestored) return;
		if (!productsQuery.data || allProducts().length === 0) return;

		const urlCursor = cursor();
		if (!urlCursor) return;

		const savedScroll = sessionStorage.getItem(`products-scroll-${urlCursor}`);
		if (savedScroll) {
			setTimeout(() => {
				window.scrollTo({
					top: Number.parseInt(savedScroll, 10),
					behavior: "auto",
				});
				scrollRestored = true;
			}, 100);
		}
	});

	// Sync cursor with latest nextCursor
	createEffect(() => {
		if (!productsQuery.data) return;
		const pages = productsQuery.data.pages;
		if (pages.length === 0) return;

		const lastPage = pages[pages.length - 1];
		const nextCursor = lastPage.nextCursor ?? undefined;
		const currentCursor = cursor();

		if (currentCursor !== nextCursor) {
			setCursor(nextCursor ?? null);
		}
	});

	// Infinite scroll observer
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
			{ rootMargin: "200px", threshold: 0.1 },
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
		<div class="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
			<div class="overflow-hidden border-3 border-black bg-primary/5 px-3 py-3 shadow-[5px_5px_0_0_#000] sm:border-4 sm:px-5 sm:py-4 sm:shadow-[6px_6px_0_0_#000]">
				{/* Compact Header */}
				<div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 sm:mb-3">
					<h1 class="font-black text-lg tracking-tight sm:text-2xl">
						{getPageTitle()}
					</h1>
					<Show when={productsQuery.data}>
						<span class="font-bold text-black/50 text-xs sm:text-sm">
							{allProducts().length}+ бүтээгдэхүүн
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
					onClearFilters={handleClearFilters}
					hasActiveFilters={hasActiveFilters()}
				/>

				{/* Products Grid */}
				<Show
					when={productsQuery.data && allProducts().length > 0}
					fallback={
						<Show
							when={productsQuery.isLoading}
							fallback={
								<Show when={productsQuery.data && allProducts().length === 0}>
									{/* Empty State */}
									<div class="py-8 text-center sm:py-12">
										<div class="mb-2 text-4xl sm:mb-3 sm:text-5xl">🔍</div>
										<Show
											when={searchTerm()}
											fallback={
												<>
													<h3 class="font-black text-base sm:text-lg">
														Бүтээгдэхүүн олдсонгүй
													</h3>
													<p class="text-black/50 text-xs sm:text-sm">
														Одоогоор бүтээгдэхүүн байхгүй
													</p>
												</>
											}
										>
											<h3 class="font-black text-base sm:text-lg">
												Үр дүн олдсонгүй
											</h3>
											<button
												type="button"
												onClick={handleClearFilters}
												class="mt-2 border-2 border-black bg-primary px-3 py-1.5 font-bold text-xs uppercase shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_0_#000] sm:mt-3 sm:px-4 sm:py-2 sm:text-sm"
											>
												Цэвэрлэх
											</button>
										</Show>
									</div>
								</Show>
							}
						>
							{/* Initial Loading Skeleton */}
							<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
								<For each={Array(8)}>{() => <ProductCardSkeleton />}</For>
							</div>
						</Show>
					}
				>
					{/* Products Grid */}
					<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
						<For each={allProducts()}>
							{(product) => <ProductCard product={product} />}
						</For>
					</div>
				</Show>

				{/* Error State */}
				<Show when={productsQuery.isError}>
					<div class="py-6 text-center sm:py-8">
						<p class="font-bold text-destructive text-sm sm:text-base">
							Алдаа гарлаа
						</p>
					</div>
				</Show>

				{/* Loading More Skeleton */}
				<Show when={productsQuery.isFetchingNextPage}>
					<div class="mt-2 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
						<For each={Array(4)}>{() => <ProductCardSkeleton />}</For>
					</div>
				</Show>

				{/* End of List */}
				<Show
					when={
						productsQuery.data &&
						!productsQuery.hasNextPage &&
						allProducts().length > 0
					}
				>
					<div class="mt-4 py-4 text-center sm:mt-6">
						<span class="font-bold text-black/40 text-xs uppercase tracking-wide sm:text-sm">
							✨ Нийт {allProducts().length} бүтээгдэхүүн
						</span>
					</div>
				</Show>

				{/* Infinite Scroll Sentinel */}
				<Show
					when={
						productsQuery.hasNextPage &&
						productsQuery.data &&
						!productsQuery.isFetchingNextPage
					}
				>
					<div ref={setupObserver} class="h-1 w-full" aria-hidden="true" />
				</Show>
			</div>
		</div>
	);
};

export default ProductsList;
