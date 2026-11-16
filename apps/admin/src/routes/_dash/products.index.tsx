import { useInfiniteQuery, useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { status as productStatuses } from "@vit/shared/constants";
import { Loader2, Plus, PlusCircle, RotateCcw, Search, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { integer, minValue, number, object, optional, picklist, pipe, string } from "valibot";
import { FilterChip } from "@/components/filter-chip";
import ProductCard from "@/components/product/product-card";
import ProductsPageSkeleton from "@/components/product/products-page-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	DEFAULT_PRODUCTS_PAGE_SIZE,
	getScrollParent,
	INFINITE_PRODUCTS_PAGE_SIZE,
	INSTANT_SEARCH_GC_TIME_MS,
	INSTANT_SEARCH_STALE_TIME_MS,
	instantSearchToProductCard,
	type ProductListStatus,
	type ProductsSearch,
} from "@/features/products/list/products-list.helpers";
import type { RouterOutputs } from "@/lib/types";
import { trpc, trpcClient } from "@/utils/trpc";

type PaginatedProductsPage = RouterOutputs["product"]["getPaginatedProducts"];

export const Route = createFileRoute("/_dash/products/")({
	component: RouteComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery({
			...ctx.trpc.category.getAllCategories.queryOptions(),
			staleTime: 15 * 60 * 1000,
		});
		void ctx.queryClient.prefetchQuery({
			...ctx.trpc.brands.getAllBrands.queryOptions(),
			staleTime: 15 * 60 * 1000,
		});
	},
	pendingComponent: ProductsPageSkeleton,
	validateSearch: object({
		brandId: optional(pipe(number(), integer(), minValue(1))),
		categoryId: optional(pipe(number(), integer(), minValue(1))),
		page: optional(pipe(number(), integer(), minValue(1)), 1),
		pageSize: optional(pipe(number(), integer(), minValue(1)), DEFAULT_PRODUCTS_PAGE_SIZE),
		searchTerm: optional(string()),
		sortDirection: optional(picklist(["asc", "desc"])),
		sortField: optional(string()),
		status: optional(picklist(productStatuses), "active"),
	}),
});

// ponytail: legacy admin products index — split filters/list later; complexity ceiling 31
// oxlint-disable-next-line complexity
function RouteComponent() {
	const {
		brandId,
		categoryId,
		searchTerm,
		sortDirection,
		sortField,
		status: productStatus,
	} = useSearch({ from: "/_dash/products/" });
	const [searchInput, setSearchInput] = useState(searchTerm || "");
	const [debouncedSearch, setDebouncedSearch] = useState(searchTerm || "");
	const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
	if (searchTerm !== prevSearchTerm) {
		setPrevSearchTerm(searchTerm);
		setSearchInput(searchTerm || "");
		setDebouncedSearch(searchTerm || "");
	}
	const hasActiveFilters =
		brandId !== undefined ||
		categoryId !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined ||
		productStatus !== "active";
	const navigate = useNavigate({ from: Route.fullPath });

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(searchInput);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		const normalizedDebouncedSearch = debouncedSearch.trim();
		const normalizedSearchTerm = (searchTerm ?? "").trim();

		if (normalizedDebouncedSearch === normalizedSearchTerm) {
			return;
		}

		navigate({
			replace: true,
			search: (prev: ProductsSearch) => ({
				...prev,
				page: 1,
				searchTerm: normalizedDebouncedSearch || undefined,
			}),
			to: "/products",
		});
	}, [debouncedSearch, navigate, searchTerm]);

	const handleSearchChange = (value: string) => {
		setSearchInput(value);
	};

	const handleClearSearch = () => {
		setSearchInput("");
		setDebouncedSearch("");
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				page: 1,
				searchTerm: undefined,
			}),
			to: "/products",
		});
	};

	const normalizedDebouncedSearch = debouncedSearch.trim();

	const instantSearchQuery = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			brandId,
			categoryId,
			limit: 10,
			query: normalizedDebouncedSearch,
			status: productStatus ?? "active",
		}),
		enabled: normalizedDebouncedSearch.length >= 2,
		gcTime: INSTANT_SEARCH_GC_TIME_MS,
		refetchOnWindowFocus: false,
		staleTime: INSTANT_SEARCH_STALE_TIME_MS,
	});

	const hasInstantResults = instantSearchQuery.data && instantSearchQuery.data.length > 0;
	const isSearching = instantSearchQuery.isFetching;
	const isInstantSearchActive = normalizedDebouncedSearch.length >= 2;
	const isTypingSearch =
		searchInput.trim() !== debouncedSearch.trim() && searchInput.trim().length >= 2;

	const handleFilterChange = (field: "brandId" | "categoryId", value: number | undefined) => {
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				[field]: value ?? undefined,
				page: 1,
			}),
			to: "/products",
		});
	};

	const handleStatusChange = (value: ProductListStatus) => {
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				page: 1,
				status: value === "active" ? undefined : value,
			}),
			to: "/products",
		});
	};

	const handleResetFilters = () => {
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				brandId: undefined,
				categoryId: undefined,
				page: 1,
				searchTerm: undefined,
				sortDirection: undefined,
				sortField: undefined,
				status: undefined,
			}),
			to: "/products",
		});
	};
	const handleSortChange = (field: string | undefined, direction: "asc" | "desc") => {
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				sortDirection: field ? direction : undefined,
				sortField: field,
			}),
			to: "/products",
		});
	};

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<input
					className="focus:border-foreground border-input h-11 w-full border bg-white pr-20 pl-9 text-[15px] outline-none"
					enterKeyHint="search"
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder="Барааны нэр эсвэл брэнд"
					type="search"
					value={searchInput}
				/>
				{searchInput && (
					<button
						aria-label="Хайлт цэвэрлэх"
						className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 z-10 flex size-9 -translate-y-1/2 items-center justify-center"
						onClick={handleClearSearch}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				)}
				{(isSearching || isTypingSearch) && (
					<div className="pointer-events-none absolute top-1/2 right-10 flex size-9 -translate-y-1/2 items-center justify-center">
						<Loader2 className="text-muted-foreground size-4 animate-spin" />
					</div>
				)}
			</div>

			<Suspense
				fallback={
					<div className="flex w-full flex-row flex-wrap gap-2">
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[140px] border sm:w-[160px]" />
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[120px] border sm:w-[160px]" />
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[120px] border sm:w-[140px]" />
					</div>
				}
			>
				<ProductsFilters
					brandId={brandId}
					categoryId={categoryId}
					hasActiveFilters={hasActiveFilters}
					onFilterChange={handleFilterChange}
					onResetFilters={handleResetFilters}
					onSortChange={handleSortChange}
					onStatusChange={handleStatusChange}
					sortDirection={sortDirection}
					sortField={sortField}
					status={productStatus ?? "active"}
				/>
			</Suspense>

			{isInstantSearchActive ? (
				<div className="space-y-3">
					{(isSearching || isTypingSearch) && !hasInstantResults ? (
						<>
							<div className="text-muted-foreground flex items-center gap-2 text-sm">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>Хайж байна...</span>
							</div>
							<SearchResultsSkeleton />
						</>
					) : hasInstantResults ? (
						<>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<p className="text-muted-foreground text-sm">
										{instantSearchQuery.data?.length} үр дүн олдсон
									</p>
									{isSearching && (
										<Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
									)}
								</div>
								<Button className="h-8" onClick={handleClearSearch} size="sm" variant="ghost">
									Бүх бүтээгдэхүүн үзэх
								</Button>
							</div>
							<div
								className={`grid grid-cols-1 border transition-opacity duration-200 xl:grid-cols-2 ${isSearching ? "opacity-50" : "opacity-100"}`}
							>
								{instantSearchQuery.data?.map((product) => (
									<ProductCard
										brands={[]}
										categories={[]}
										key={product.id}
										product={instantSearchToProductCard(product)}
									/>
								))}
							</div>
						</>
					) : !isSearching && !isTypingSearch ? (
						<div className="rounded-base border-border text-muted-foreground border p-8 text-center">
							&ldquo;{normalizedDebouncedSearch}&rdquo; хайлтаар үр дүн олдсонгүй
						</div>
					) : null}
				</div>
			) : null}

			{!isInstantSearchActive && (
				<Suspense fallback={<ProductsPageSkeleton />}>
					<ProductsList
						brandId={brandId}
						categoryId={categoryId}
						searchTerm={searchTerm}
						sortDirection={sortDirection}
						sortField={sortField}
						status={productStatus ?? "active"}
					/>
				</Suspense>
			)}
		</div>
	);
}

function ProductsFilters({
	brandId,
	categoryId,
	hasActiveFilters,
	onFilterChange,
	onResetFilters,
	onSortChange,
	onStatusChange,
	sortDirection,
	sortField,
	status,
}: {
	brandId?: number;
	categoryId?: number;
	hasActiveFilters: boolean;
	onFilterChange: (field: "brandId" | "categoryId", value: number | undefined) => void;
	onResetFilters: () => void;
	onSortChange: (field: string | undefined, direction: "asc" | "desc") => void;
	onStatusChange: (value: ProductListStatus) => void;
	sortDirection?: "asc" | "desc";
	sortField?: string;
	status: ProductListStatus;
}) {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const sortValue = sortField && sortDirection ? `${sortField}:${sortDirection}` : "default";
	return (
		<div className="flex items-center gap-2">
			<div className="-mx-3 flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-2 overflow-x-auto px-3 md:mx-0 md:px-0">
				<FilterChip
					idle="active"
					label="Төлөв"
					onChange={onStatusChange}
					options={[
						{ label: "Идэвхтэй", value: "active" },
						{ label: "Ноорог", value: "draft" },
						{ label: "Дууссан", value: "out_of_stock" },
					]}
					value={status}
				/>
				<FilterChip
					idle="all"
					label="Ангилал"
					onChange={(value) =>
						onFilterChange("categoryId", value === "all" ? undefined : Number(value))
					}
					options={[
						{ label: "Бүх ангилал", value: "all" },
						...categories.map((category) => ({ label: category.name, value: String(category.id) })),
					]}
					value={categoryId === undefined ? "all" : String(categoryId)}
				/>
				<FilterChip
					idle="all"
					label="Брэнд"
					onChange={(value) =>
						onFilterChange("brandId", value === "all" ? undefined : Number(value))
					}
					options={[
						{ label: "Бүх брэнд", value: "all" },
						...brands.map((brand) => ({ label: brand.name, value: String(brand.id) })),
					]}
					value={brandId === undefined ? "all" : String(brandId)}
				/>
				<FilterChip
					idle="default"
					label="Эрэмбэ"
					onChange={(value) => {
						const [field, direction] = value.split(":");
						onSortChange(
							field && direction ? field : undefined,
							direction === "asc" ? "asc" : "desc",
						);
					}}
					options={[
						{ label: "Анхдагч", value: "default" },
						{ label: "Сүүлд зассан", value: "updatedAt:desc" },
						{ label: "Үлдэгдэл багаас", value: "stock:asc" },
						{ label: "Үлдэгдэл ихээс", value: "stock:desc" },
						{ label: "Хямдаас", value: "price:asc" },
						{ label: "Үнэтэйгээс", value: "price:desc" },
					]}
					value={sortValue}
				/>
				{hasActiveFilters && (
					<button
						className="text-muted-foreground hover:text-foreground flex h-9 shrink-0 items-center gap-1.5 px-2 text-sm"
						onClick={onResetFilters}
						type="button"
					>
						<RotateCcw className="size-3.5" />
						Цэвэрлэх
					</button>
				)}
			</div>

			<Link className="hidden md:block" to="/products/add">
				<Button className="h-10 gap-2 px-4 text-sm">
					<PlusCircle className="size-4" />
					Бараа нэмэх
				</Button>
			</Link>
			<Link
				aria-label="Бараа нэмэх"
				className="bg-primary border-foreground fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 flex size-14 items-center justify-center rounded-full border shadow-lg md:hidden"
				to="/products/add"
			>
				<Plus className="size-6" />
			</Link>
		</div>
	);
}

function ProductsList({
	brandId,
	categoryId,
	searchTerm,
	sortDirection,
	sortField,
	status,
}: {
	brandId?: number;
	categoryId?: number;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
	status: ProductListStatus;
}) {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const {
		data: productsData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isPending,
	} = useInfiniteQuery<PaginatedProductsPage>({
		gcTime: 15 * 60 * 1000,
		getNextPageParam: (lastPage) =>
			lastPage.pagination.hasNextPage ? lastPage.pagination.currentPage + 1 : undefined,
		initialPageParam: 1,
		queryFn: async ({ pageParam }): Promise<PaginatedProductsPage> =>
			trpcClient.product.getPaginatedProducts.query({
				brandId,
				categoryId,
				page: Number(pageParam),
				pageSize: INFINITE_PRODUCTS_PAGE_SIZE,
				searchTerm,
				sortDirection,
				sortField,
				status,
			}),
		queryKey: [
			"admin-products-infinite",
			INFINITE_PRODUCTS_PAGE_SIZE,
			brandId,
			categoryId,
			sortField,
			sortDirection,
			searchTerm,
			status,
		],
		staleTime: 60_000,
	});

	const products = productsData?.pages.flatMap((page) => page.products) ?? [];

	useEffect(() => {
		const sentinel = document.getElementById("products-infinite-sentinel");
		if (!sentinel || !hasNextPage) {
			return;
		}

		const observerRoot = getScrollParent(sentinel);
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
					void fetchNextPage();
				}
			},
			{
				root: observerRoot ?? undefined,
				rootMargin: "400px",
				threshold: 0,
			},
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	if (isPending) {
		return <SearchResultsSkeleton />;
	}

	if (products.length === 0) {
		return (
			<div className="rounded-base border-border text-muted-foreground border p-8 text-center">
				{searchTerm
					? `"${searchTerm}" олдсонгүй`
					: "Бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилнө үү."}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 border xl:grid-cols-2">
				{products.map((product) => (
					<ProductCard brands={brands} categories={categories} key={product.id} product={product} />
				))}
			</div>
			{isFetchingNextPage && <SearchResultsSkeleton />}
			{hasNextPage && <div className="h-2 w-full" id="products-infinite-sentinel" />}
			{!hasNextPage && (
				<div className="text-muted-foreground py-4 text-center text-sm">
					Нийт {products.length} бүтээгдэхүүн
				</div>
			)}
		</div>
	);
}

function SearchResultsSkeleton() {
	return (
		<div className="grid grid-cols-1 border xl:grid-cols-2">
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					className="rounded-base border-border bg-card overflow-hidden border shadow-none"
					key={index}
				>
					<div className="flex flex-row">
						<div className="border-border bg-background flex h-20 w-20 shrink-0 items-center justify-center border-r p-2">
							<Skeleton className="rounded-base h-full w-full" />
						</div>
						<div className="flex flex-1 flex-col p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1 space-y-2">
									<Skeleton className="rounded-base h-5 w-3/4" />
									<div className="flex items-center gap-2">
										<Skeleton className="rounded-base h-4 w-16" />
										<Skeleton className="rounded-base h-4 w-20" />
									</div>
								</div>
								<Skeleton className="h-6 w-20 rounded-full" />
							</div>
							<div className="mt-1 flex items-center gap-3">
								<Skeleton className="rounded-base h-6 w-16" />
								<Skeleton className="rounded-base h-4 w-12" />
							</div>
							<div className="mt-2 flex gap-2">
								<Skeleton className="rounded-base h-8 w-24" />
								<Skeleton className="rounded-base h-8 w-8" />
								<Skeleton className="rounded-base h-8 w-8" />
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
