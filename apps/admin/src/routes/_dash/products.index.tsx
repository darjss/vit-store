import {
	useInfiniteQuery,
	useQuery,
	useSuspenseQueries,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { PRODUCT_PER_PAGE } from "@vit/shared/constants";
import {
	ChevronDown,
	ChevronUp,
	Loader2,
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { trpc, trpcClient } from "@/utils/trpc";

type ProductsSearch = {
	page: number;
	pageSize: number;
	brandId?: number;
	categoryId?: number;
	status?: "active" | "draft" | "out_of_stock";
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
};

const INSTANT_SEARCH_STALE_TIME_MS = 5 * 60 * 1000;
const INSTANT_SEARCH_GC_TIME_MS = 30 * 60 * 1000;
const INFINITE_PRODUCTS_PAGE_SIZE = 9;
const ADMIN_VIRTUAL_OVERSCAN_ROWS = 2;
const ADMIN_DEFAULT_ROW_HEIGHT = 248;

function getAdminProductColumns(width: number) {
	if (width >= 1280) return 3;
	if (width >= 640) return 2;
	return 1;
}

function chunkItems<T>(items: T[], chunkSize: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize));
	}
	return chunks;
}

export const Route = createFileRoute("/_dash/products/")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.category.getAllCategories.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.brands.getAllBrands.queryOptions(),
			),
		]);
	},
	validateSearch: v.object({
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(
			v.pipe(v.number(), v.integer(), v.minValue(1)),
			PRODUCT_PER_PAGE,
		),
		brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		sortField: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
		searchTerm: v.optional(v.string()),
	}),
});

function RouteComponent() {
	const { brandId, categoryId, sortField, sortDirection, searchTerm } =
		useSearch({ from: "/_dash/products/" }) as ProductsSearch;
	const [searchInput, setSearchInput] = useState(searchTerm || "");
	const [debouncedSearch, setDebouncedSearch] = useState(searchTerm || "");
	const hasActiveFilters =
		brandId !== undefined ||
		categoryId !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
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
			to: "/products",
			replace: true,
			search: (prev: ProductsSearch) => ({
				...prev,
				searchTerm: normalizedDebouncedSearch || undefined,
				page: 1,
			}),
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
			to: "/products",
			search: (prev: ProductsSearch) => ({
				...prev,
				searchTerm: undefined,
				page: 1,
			}),
		});
	};

	const normalizedDebouncedSearch = debouncedSearch.trim();

	const instantSearchQuery = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			query: normalizedDebouncedSearch,
			limit: 10,
			brandId,
			categoryId,
			status: "active",
		}),
		enabled: normalizedDebouncedSearch.length >= 2,
		staleTime: INSTANT_SEARCH_STALE_TIME_MS,
		gcTime: INSTANT_SEARCH_GC_TIME_MS,
		refetchOnWindowFocus: false,
	});

	const hasInstantResults =
		instantSearchQuery.data && instantSearchQuery.data.length > 0;
	const isSearching = instantSearchQuery.isFetching;
	const isInstantSearchActive = normalizedDebouncedSearch.length >= 2;
	const isTypingSearch =
		searchInput.trim() !== debouncedSearch.trim() &&
		searchInput.trim().length >= 2;

	const handleFilterChange = (
		field: "brandId" | "categoryId",
		value: number | undefined,
	) => {
		navigate({
			to: "/products",
			search: (prev: ProductsSearch) => ({
				...prev,
				[field]: value ?? undefined,
				page: 1,
			}),
		});
	};
	const handleResetFilters = () => {
		navigate({
			to: "/products",
			search: (prev: ProductsSearch) => ({
				...prev,
				sortField: undefined,
				sortDirection: "asc",
				searchTerm: undefined,
				page: 1,
				brandId: undefined,
				categoryId: undefined,
			}),
		});
	};
	const handleSort = (field: string) => {
		const newDirection =
			sortField === field && sortDirection === "asc" ? "desc" : "asc";
		navigate({
			to: "/products",
			search: (prev: ProductsSearch) => ({
				...prev,
				sortField: field,
				sortDirection: newDirection,
			}),
		});
	};

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-6 w-6 text-muted-foreground" />
				<Input
					placeholder="Бүтээгдэхүүн хайх..."
					value={searchInput}
					onChange={(e) => handleSearchChange(e.target.value)}
					className="h-12 w-full rounded-base border-2 border-border bg-background pr-14 pl-14 shadow-shadow"
				/>
				{searchInput && (
					<Button
						size="icon"
						variant="secondary"
						className="-translate-y-1/2 absolute top-1/2 right-14 h-8 w-8 rounded-base border-2 border-border hover:bg-muted"
						onClick={handleClearSearch}
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
				{(isSearching || isTypingSearch) && (
					<div className="-translate-y-1/2 absolute top-1/2 right-1 flex h-10 w-12 items-center justify-center">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				)}
			</div>

			<Suspense
				fallback={
					<div className="flex w-full flex-row gap-2">
						<Skeleton className="h-10 w-full min-w-[140px] rounded-base border-2 border-border sm:w-[160px]" />
						<Skeleton className="h-10 w-full min-w-[120px] rounded-base border-2 border-border sm:w-[160px]" />
					</div>
				}
			>
				<ProductsFilters
					brandId={brandId}
					categoryId={categoryId}
					onFilterChange={handleFilterChange}
					hasActiveFilters={hasActiveFilters}
					sortField={sortField}
					sortDirection={sortDirection}
					onSort={handleSort}
					onResetFilters={handleResetFilters}
				/>
			</Suspense>

			{isInstantSearchActive ? (
				<div className="space-y-3">
					{(isSearching || isTypingSearch) && !hasInstantResults ? (
						<>
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
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
										<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
									)}
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={handleClearSearch}
									className="h-8"
								>
									Бүх бүтээгдэхүүн үзэх
								</Button>
							</div>
							<div
								className={`grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3 ${isSearching ? "opacity-50" : "opacity-100"}`}
							>
								{instantSearchQuery.data?.map((product) => (
									<ProductCard
										key={product.id}
										product={
											{
												id: product.id,
												name: product.name,
												slug: product.slug,
												price: product.price,
												stock: product.stock,
												status: "active" as const,
												discount: 0,
												brandId: 0,
												categoryId: 0,
												description: "",
												amount: "",
												potency: "",
												dailyIntake: 0,
												createdAt: new Date(),
												updatedAt: null,
												deletedAt: null,
												tags: [],
												isFeatured: false,
												ingredients: [],
												seoTitle: null,
												seoDescription: null,
												name_mn: null,
												weightGrams: 0,
												expirationDate: null,
												images: product.images.map((image, index) => ({
													id: index,
													url: image.url,
													isPrimary: index === 0,
												})),
											} as never
										}
										brands={[]}
										categories={[]}
									/>
								))}
							</div>
						</>
					) : !isSearching && !isTypingSearch ? (
						<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
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
						sortField={sortField}
						sortDirection={sortDirection}
						searchTerm={searchTerm}
					/>
				</Suspense>
			)}
		</div>
	);
}

function ProductsFilters({
	brandId,
	categoryId,
	onFilterChange,
	hasActiveFilters,
	sortField,
	sortDirection,
	onSort,
	onResetFilters,
}: {
	brandId?: number;
	categoryId?: number;
	onFilterChange: (
		field: "brandId" | "categoryId",
		value: number | undefined,
	) => void;
	hasActiveFilters: boolean;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	onSort: (field: string) => void;
	onResetFilters: () => void;
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
					value={categoryId === undefined ? "all" : categoryId.toString()}
					onValueChange={(value) =>
						onFilterChange(
							"categoryId",
							value === "all" ? undefined : Number.parseInt(value, 10),
						)
					}
				>
					<SelectTrigger className="h-10 w-full min-w-[140px] rounded-base border-2 border-border sm:w-[160px]">
						<SelectValue placeholder="All Categories" />
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
					value={brandId === undefined ? "all" : brandId.toString()}
					onValueChange={(value) =>
						onFilterChange(
							"brandId",
							value === "all" ? undefined : Number.parseInt(value, 10),
						)
					}
				>
					<SelectTrigger className="h-10 w-full min-w-[120px] rounded-base border-2 border-border sm:w-[160px]">
						<SelectValue placeholder="All Brands" />
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
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-wrap gap-2">
					{(hasActiveFilters || sortField !== "") && (
						<Button
							variant="outline"
							size="sm"
							className="h-10 rounded-base border-2 border-border px-3"
							onClick={onResetFilters}
						>
							<RotateCcw className="mr-1 h-4 w-4" />
						</Button>
					)}
					<Button
						size="sm"
						variant={sortField === "stock" ? "default" : "outline"}
						className="h-10 rounded-base border-2 border-border px-3"
						onClick={() => onSort("stock")}
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
						size="sm"
						variant={sortField === "price" ? "default" : "outline"}
						className="h-10 rounded-base border-2 border-border px-3"
						onClick={() => onSort("price")}
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
						size="sm"
						variant={sortField === "createdAt" ? "default" : "outline"}
						className="h-10 rounded-base border-2 border-border px-3"
						onClick={() => onSort("createdAt")}
					>
						Огноо
						{sortField === "createdAt" &&
							(sortDirection === "asc" ? (
								<ChevronUp className="ml-1 h-4 w-4" />
							) : (
								<ChevronDown className="ml-1 h-4 w-4" />
							))}
					</Button>
				</div>

				<Link to="/products/add">
					<Button className="h-10 gap-2 rounded-base border-2 border-border bg-primary px-4 shadow-shadow hover:bg-primary/90">
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
	sortField,
	sortDirection,
	searchTerm,
}: {
	brandId?: number;
	categoryId?: number;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
}) {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const {
		data: productsData,
		isPending,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery({
		queryKey: [
			"admin-products-infinite",
			INFINITE_PRODUCTS_PAGE_SIZE,
			brandId,
			categoryId,
			sortField,
			sortDirection,
			searchTerm,
		],
		initialPageParam: 1,
		queryFn: async ({ pageParam }) =>
			trpcClient.product.getPaginatedProducts.query({
				page: Number(pageParam),
				pageSize: INFINITE_PRODUCTS_PAGE_SIZE,
				brandId,
				categoryId,
				status: "active",
				sortField,
				sortDirection,
				searchTerm,
			}),
		getNextPageParam: (lastPage) =>
			lastPage.pagination.hasNextPage
				? lastPage.pagination.currentPage + 1
				: undefined,
		staleTime: 60_000,
		gcTime: 15 * 60 * 1000,
	});

	const products = productsData?.pages.flatMap((page) => page.products) ?? [];
	const gridRef = useRef<HTMLDivElement | null>(null);
	const firstRowRef = useRef<HTMLDivElement | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const [gridWidth, setGridWidth] = useState(0);
	const [gridTop, setGridTop] = useState(0);
	const [viewportTop, setViewportTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(0);
	const [rowHeight, setRowHeight] = useState(ADMIN_DEFAULT_ROW_HEIGHT);

	const columnCount = useMemo(
		() => getAdminProductColumns(gridWidth || 1280),
		[gridWidth],
	);
	const productRows = useMemo(
		() => chunkItems(products, columnCount),
		[products, columnCount],
	);
	const totalHeight = productRows.length * rowHeight;
	const visibleRange = useMemo(() => {
		if (productRows.length === 0) return { start: 0, end: 0 };

		const overscan = rowHeight * ADMIN_VIRTUAL_OVERSCAN_ROWS;
		const start = Math.max(
			0,
			Math.floor((viewportTop - gridTop - overscan) / rowHeight),
		);
		const end = Math.min(
			productRows.length,
			Math.ceil(
				(viewportTop + viewportHeight - gridTop + overscan) / rowHeight,
			),
		);

		return {
			start,
			end: Math.max(start + 1, end),
		};
	}, [gridTop, productRows.length, rowHeight, viewportHeight, viewportTop]);
	const visibleRows = productRows.slice(visibleRange.start, visibleRange.end);

	useEffect(() => {
		const updateLayout = () => {
			const nextWidth = gridRef.current?.clientWidth ?? window.innerWidth;
			const nextTop = gridRef.current
				? window.scrollY + gridRef.current.getBoundingClientRect().top
				: 0;

			setGridWidth(nextWidth);
			setGridTop(nextTop);
			setViewportTop(window.scrollY);
			setViewportHeight(window.innerHeight);
		};

		updateLayout();

		const handleWindowChange = () => {
			if (animationFrameRef.current !== null) return;
			animationFrameRef.current = window.requestAnimationFrame(() => {
				animationFrameRef.current = null;
				updateLayout();
			});
		};

		const resizeObserver = new ResizeObserver(() => updateLayout());
		if (gridRef.current) resizeObserver.observe(gridRef.current);

		window.addEventListener("scroll", handleWindowChange, { passive: true });
		window.addEventListener("resize", handleWindowChange);

		return () => {
			if (animationFrameRef.current !== null) {
				window.cancelAnimationFrame(animationFrameRef.current);
			}
			resizeObserver.disconnect();
			window.removeEventListener("scroll", handleWindowChange);
			window.removeEventListener("resize", handleWindowChange);
		};
	}, []);

	useEffect(() => {
		if (!firstRowRef.current) return;

		const updateHeight = () => {
			const nextHeight = firstRowRef.current?.getBoundingClientRect().height;
			if (nextHeight && Math.abs(nextHeight - rowHeight) > 1) {
				setRowHeight(nextHeight);
			}
		};

		updateHeight();
		const resizeObserver = new ResizeObserver(() => updateHeight());
		resizeObserver.observe(firstRowRef.current);

		return () => resizeObserver.disconnect();
	}, [rowHeight]);

	useEffect(() => {
		const sentinel = document.getElementById("products-infinite-sentinel");
		if (!sentinel || !hasNextPage) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
					void fetchNextPage();
				}
			},
			{ rootMargin: "300px", threshold: 0.1 },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	if (isPending) {
		return <SearchResultsSkeleton />;
	}

	if (products.length === 0) {
		return (
			<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
				{searchTerm
					? `"${searchTerm}" олдсонгүй`
					: "Бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилнө үү."}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div ref={gridRef} className="relative w-full">
				<div style={{ height: `${totalHeight}px` }}>
					{visibleRows.map((row, rowIndex) => {
						const actualRowIndex = visibleRange.start + rowIndex;
						return (
							<div
								key={`row-${actualRowIndex}`}
								ref={rowIndex === 0 ? firstRowRef : undefined}
								className="absolute top-0 left-0 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
								style={{
									transform: `translateY(${actualRowIndex * rowHeight}px)`,
								}}
							>
								{row.map((product) => (
									<ProductCard
										key={product.id}
										product={product}
										brands={brands}
										categories={categories}
									/>
								))}
							</div>
						);
					})}
				</div>
			</div>
			{isFetchingNextPage && <SearchResultsSkeleton />}
			{hasNextPage && (
				<div id="products-infinite-sentinel" className="h-2 w-full" />
			)}
			{!hasNextPage && (
				<div className="py-4 text-center text-muted-foreground text-sm">
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
					key={index}
					className="overflow-hidden rounded-base border-2 border-border bg-card shadow-none"
				>
					<div className="flex flex-row">
						<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
							<Skeleton className="h-full w-full rounded-base" />
						</div>
						<div className="flex flex-1 flex-col p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1 space-y-2">
									<Skeleton className="h-5 w-3/4 rounded-base" />
									<div className="flex items-center gap-2">
										<Skeleton className="h-4 w-16 rounded-base" />
										<Skeleton className="h-4 w-20 rounded-base" />
									</div>
								</div>
								<Skeleton className="h-6 w-20 rounded-full" />
							</div>
							<div className="mt-1 flex items-center gap-3">
								<Skeleton className="h-6 w-16 rounded-base" />
								<Skeleton className="h-4 w-12 rounded-base" />
							</div>
							<div className="mt-2 flex gap-2">
								<Skeleton className="h-8 w-24 rounded-base" />
								<Skeleton className="h-8 w-8 rounded-base" />
								<Skeleton className="h-8 w-8 rounded-base" />
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
