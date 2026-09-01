import { useInfiniteQuery, useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { status as productStatuses } from "@vit/shared/constants";
import { ChevronDown, ChevronUp, Loader2, PlusCircle, RotateCcw, Search, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import * as v from "valibot";
import ProductCard from "@/components/product/product-card";
import ProductsPageSkeleton from "@/components/product/products-page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import { parsePicklistValue } from "@/lib/parse-select";
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
	validateSearch: v.object({
		brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(
			v.pipe(v.number(), v.integer(), v.minValue(1)),
			DEFAULT_PRODUCTS_PAGE_SIZE,
		),
		searchTerm: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
		sortField: v.optional(v.string()),
		status: v.optional(v.picklist(productStatuses), "active"),
	}),
});

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

	useEffect(() => {
		setSearchInput(searchTerm || "");
		setDebouncedSearch(searchTerm || "");
	}, [searchTerm]);

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
				sortDirection: "asc",
				sortField: undefined,
				status: undefined,
			}),
			to: "/products",
		});
	};
	const handleSort = (field: string) => {
		const newDirection = sortField === field && sortDirection === "asc" ? "desc" : "asc";
		navigate({
			search: (prev: ProductsSearch) => ({
				...prev,
				sortDirection: newDirection,
				sortField: field,
			}),
			to: "/products",
		});
	};

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="text-muted-foreground absolute top-1/2 left-4 h-6 w-6 -translate-y-1/2" />
				<Input
					className="rounded-base border-border bg-background h-12 w-full border-2 pr-14 pl-14 shadow-none focus:translate-y-0 focus:shadow-none"
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder="Бүтээгдэхүүн хайх..."
					value={searchInput}
				/>
				{searchInput && (
					<button
						aria-label="Хайлт цэвэрлэх"
						className="rounded-base border-border bg-secondary text-secondary-foreground hover:bg-muted absolute top-1/2 right-14 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border-2 transition-colors"
						onClick={handleClearSearch}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				)}
				{(isSearching || isTypingSearch) && (
					<div className="pointer-events-none absolute top-1/2 right-1 flex h-10 w-12 -translate-y-1/2 items-center justify-center">
						<Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
					</div>
				)}
			</div>

			<Suspense
				fallback={
					<div className="flex w-full flex-row flex-wrap gap-2">
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[140px] border-2 sm:w-[160px]" />
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[120px] border-2 sm:w-[160px]" />
						<Skeleton className="rounded-base border-border h-10 w-full min-w-[120px] border-2 sm:w-[140px]" />
					</div>
				}
			>
				<ProductsFilters
					brandId={brandId}
					categoryId={categoryId}
					hasActiveFilters={hasActiveFilters}
					onFilterChange={handleFilterChange}
					onResetFilters={handleResetFilters}
					onSort={handleSort}
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
								className={`grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3 ${isSearching ? "opacity-50" : "opacity-100"}`}
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
						<div className="rounded-base border-border text-muted-foreground border-2 p-8 text-center">
							"{normalizedDebouncedSearch}" хайлтаар үр дүн олдсонгүй
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
	onSort,
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
	onSort: (field: string) => void;
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

	return (
		<>
			<div className="flex w-full flex-row gap-2">
				<Select
					onValueChange={(value) =>
						onFilterChange("categoryId", value === "all" ? undefined : Number.parseInt(value, 10))
					}
					value={categoryId === undefined ? "all" : categoryId.toString()}
				>
					<SelectTrigger className="rounded-base border-border h-10 w-full min-w-[140px] border-2 sm:w-[160px]">
						<SelectValue placeholder="Бүх ангилал" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Бүх ангилал</SelectItem>
						{categories.map((category) => (
							<SelectItem key={category.id} value={category.id.toString()}>
								{category.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					onValueChange={(value) =>
						onFilterChange("brandId", value === "all" ? undefined : Number.parseInt(value, 10))
					}
					value={brandId === undefined ? "all" : brandId.toString()}
				>
					<SelectTrigger className="rounded-base border-border h-10 w-full min-w-[120px] border-2 sm:w-[160px]">
						<SelectValue placeholder="Бүх брэнд" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Бүх брэнд</SelectItem>
						{brands.map((brand) => (
							<SelectItem key={brand.id} value={brand.id.toString()}>
								{brand.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					onValueChange={(value) => {
						const parsed = parsePicklistValue(productStatuses, value);
						if (parsed) {
							onStatusChange(parsed);
						}
					}}
					value={status}
				>
					<SelectTrigger className="rounded-base border-border h-10 w-full min-w-[120px] border-2 sm:w-[140px]">
						<SelectValue placeholder="Төлөв" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active">Идэвхтэй</SelectItem>
						<SelectItem value="draft">Ноорог</SelectItem>
						<SelectItem value="out_of_stock">Дууссан</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-wrap gap-2">
					{(hasActiveFilters || sortField !== "") && (
						<Button
							className="rounded-base border-border h-10 border-2 px-3"
							onClick={onResetFilters}
							size="sm"
							variant="outline"
						>
							<RotateCcw className="mr-1 h-4 w-4" />
						</Button>
					)}
					<Button
						className="rounded-base border-border h-10 border-2 px-3"
						onClick={() => onSort("stock")}
						size="sm"
						variant={sortField === "stock" ? "default" : "outline"}
					>
						үлдэгдэл
						{sortField === "stock" &&
							(sortDirection === "asc" ? (
								<ChevronUp className="ml-1 h-4 w-4" />
							) : (
								<ChevronDown className="ml-1 h-4 w-4" />
							))}
					</Button>
					<Button
						className="rounded-base border-border h-10 border-2 px-3"
						onClick={() => onSort("price")}
						size="sm"
						variant={sortField === "price" ? "default" : "outline"}
					>
						Үнэ
						{sortField === "price" &&
							(sortDirection === "asc" ? (
								<ChevronUp className="ml-1 h-4 w-4" />
							) : (
								<ChevronDown className="ml-1 h-4 w-4" />
							))}
					</Button>
					<Button
						className="rounded-base border-border h-10 border-2 px-3"
						onClick={() => onSort("updatedAt")}
						size="sm"
						variant={sortField === "updatedAt" ? "default" : "outline"}
					>
						Огноо
						{sortField === "updatedAt" &&
							(sortDirection === "asc" ? (
								<ChevronUp className="ml-1 h-4 w-4" />
							) : (
								<ChevronDown className="ml-1 h-4 w-4" />
							))}
					</Button>
				</div>

				<Link to="/products/add">
					<Button className="rounded-base border-border bg-primary shadow-shadow hover:bg-primary/90 h-10 gap-2 border-2 px-4">
						<PlusCircle className="h-5 w-5" />
						<span className="hidden sm:inline">Бүтээгдэхүүн нэмэх</span>
						<span className="sm:hidden">Нэмэх</span>
					</Button>
				</Link>
			</div>
		</>
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
			<div className="rounded-base border-border text-muted-foreground border-2 p-8 text-center">
				{searchTerm
					? `"${searchTerm}" олдсонгүй`
					: "Бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилнө үү."}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					className="rounded-base border-border bg-card overflow-hidden border-2 shadow-none"
					key={index}
				>
					<div className="flex flex-row">
						<div className="border-border bg-background flex h-20 w-20 shrink-0 items-center justify-center border-r-2 p-2">
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
