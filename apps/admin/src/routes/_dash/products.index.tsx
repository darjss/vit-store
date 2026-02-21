import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
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
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import * as v from "valibot";
import { DataPagination } from "@/components/data-pagination";
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
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/products/")({
	component: RouteComponent,
	loader: async ({ context: ctx, location }) => {
		const search = location.search as {
			page?: number;
			pageSize?: number;
			brandId?: number;
			categoryId?: number;
			sortField?: string;
			sortDirection?: "asc" | "desc";
			searchTerm?: string;
		};
		await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.product.getPaginatedProducts.queryOptions({
					page: search.page ?? 1,
					pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
					brandId: search.brandId,
					categoryId: search.categoryId,
					sortField: search.sortField,
					sortDirection: search.sortDirection,
					searchTerm: search.searchTerm,
				}),
			),
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
	const {
		page,
		pageSize,
		brandId,
		categoryId,
		sortField,
		sortDirection,
		searchTerm,
	} = useSearch({ from: "/_dash/products/" });
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
			search: (prev) => ({
				...prev,
				searchTerm: undefined,
				page: 1,
			}),
		});
	};

	const instantSearchQuery = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			query: debouncedSearch,
			limit: 50,
		}),
		enabled: debouncedSearch.length >= 2,
		staleTime: 60_000,
	});

	const hasInstantResults =
		instantSearchQuery.data && instantSearchQuery.data.length > 0;
	const isSearching = instantSearchQuery.isFetching;
	const isInstantSearchActive = debouncedSearch.length >= 2;

	const handleFilterChange = (
		field: "brandId" | "categoryId",
		value: number | undefined,
	) => {
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				[field]: value ?? undefined,
				page: 1,
			}),
		});
	};
	const handleResetFilters = () => {
		navigate({
			to: "/products",
			search: (prev) => ({
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
			search: (prev) => ({
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
				{isSearching && (
					<div className="-translate-y-1/2 absolute top-1/2 right-1 flex h-10 w-12 items-center justify-center">
						<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
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

			{hasInstantResults ? (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<p className="text-muted-foreground text-sm">
							{instantSearchQuery.data?.length} үр дүн олдсон
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleClearSearch}
							className="h-8"
						>
							Бүх бүтээгдэхүүн үзэх
						</Button>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
				</div>
			) : isInstantSearchActive && !isSearching ? (
				<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
					"{debouncedSearch}" хайлтаар үр дүн олдсонгүй
				</div>
			) : null}

			{!isInstantSearchActive && (
				<Suspense fallback={<ProductsPageSkeleton />}>
					<ProductsList
						page={page}
						pageSize={pageSize}
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
	page,
	pageSize,
	brandId,
	categoryId,
	sortField,
	sortDirection,
	searchTerm,
}: {
	page: number;
	pageSize: number;
	brandId?: number;
	categoryId?: number;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
}) {
	const navigate = useNavigate({ from: Route.fullPath });
	const [
		{ data: productsData, isPending },
		{ data: categories },
		{ data: brands },
	] = useSuspenseQueries({
		queries: [
			{
				...trpc.product.getPaginatedProducts.queryOptions({
					page,
					pageSize,
					brandId,
					categoryId,
					sortField,
					sortDirection,
					searchTerm,
				}),
				staleTime: 30_000,
			},
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});
	const products = productsData.products;
	const pagination = productsData.pagination;

	const handlePageChange = (page: number) => {
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				page: page,
			}),
		});
	};

	if (products.length === 0) {
		return (
			<>
				<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
					{searchTerm
						? `"${searchTerm}" олдсонгүй`
						: "Бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилнө үү."}
				</div>
				<div>
					<DataPagination
						currentPage={pagination.currentPage}
						totalItems={pagination.totalCount}
						itemsPerPage={PRODUCT_PER_PAGE}
						onPageChange={handlePageChange}
					/>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="space-y-4">
				{isPending && (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{Array.from({ length: 6 }).map((_, index) => (
							<div
								key={index}
								className="overflow-hidden rounded-base border-2 border-border bg-card shadow-none transition-all hover:shadow-none"
							>
								<div className="flex flex-row">
									<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
										<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
											<div className="h-full w-full animate-pulse rounded-base border-2 border-border bg-secondary-background" />
										</div>
									</div>
									<div className="flex flex-1 flex-col p-3">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0 flex-1 space-y-2">
												<div className="h-5 w-3/4 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												<div className="flex items-center gap-2">
													<div className="h-4 w-16 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
													<div className="h-4 w-1 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
													<div className="h-4 w-20 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												</div>
											</div>
											<div className="h-6 w-20 animate-pulse rounded-full border-2 border-border bg-secondary-background" />
										</div>
										<div className="mt-1 flex items-center gap-3">
											<div className="h-6 w-16 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
											<div className="flex items-center gap-1">
												<div className="h-4 w-4 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												<div className="h-4 w-8 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												<div className="h-3 w-12 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
											</div>
										</div>
										<div className="mt-2 flex items-center justify-between gap-2">
											<div className="flex gap-2">
												<div className="h-8 w-24 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												<div className="h-8 w-8 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
												<div className="h-8 w-8 animate-pulse rounded-base border-2 border-border bg-secondary-background" />
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
				{!isPending && (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{products.map((product) => (
							<ProductCard
								key={product.id}
								product={product}
								brands={brands}
								categories={categories}
							/>
						))}
					</div>
				)}
			</div>
			<div>
				<DataPagination
					currentPage={pagination.currentPage}
					totalItems={pagination.totalCount}
					itemsPerPage={PRODUCT_PER_PAGE}
					onPageChange={handlePageChange}
				/>
			</div>
		</>
	);
}
