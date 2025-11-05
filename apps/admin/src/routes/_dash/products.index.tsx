import { useSuspenseQueries } from "@tanstack/react-query";
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
import { Suspense, useState } from "react";
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
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/products/")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		const [products, categories, brands] = await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.product.getPaginatedProducts.queryOptions({}),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.category.getAllCategories.queryOptions(),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.brands.getAllBrands.queryOptions(),
			),
		]);
		console.log("products", products);
		console.log("categories", categories);
		console.log("brands", brands);
		return { products, categories, brands };
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

function ProductsContent() {
	const {
		page,
		pageSize,
		brandId,
		categoryId,
		sortField,
		sortDirection,
		searchTerm,
	} = useSearch({ from: "/_dash/products/" });
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const hasActiveFilters =
		brandId !== undefined ||
		categoryId !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
	const navigate = useNavigate({ from: Route.fullPath });
	const [
		{ data: productsData, isPending },
		{ data: categories },
		{ data: brands },
	] = useSuspenseQueries({
		queries: [
			trpc.product.getPaginatedProducts.queryOptions({
				page,
				pageSize,
				brandId,
				categoryId,
				sortField,
				sortDirection,
				searchTerm,
			}),
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});
	const products = productsData.products;
	const pagination = productsData.pagination;
	console.log("products rendered ", products);

	const handleSearch = () => {
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				searchTerm: inputValue,
			}),
		});
	};
	const handleClearSearch = () => {
		console.log("clear search");
	};
	const handleFilterChange = (
		field: "brandId" | "categoryId",
		value: number | undefined,
	) => {
		console.log("filter change", field, value);
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				[field]: value ?? undefined,
			}),
		});
	};
	const handleResetFilters = () => {
		console.log("reset filters");
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
		console.log("sort", field);
		// If clicking the same field, toggle direction
		// If clicking a different field, reset to ascending
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

	const handlePageChange = (page: number) => {
		console.log("page change", page);
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				page: page,
			}),
		});
	};

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-6 w-6 text-muted-foreground" />
				<Input
					placeholder="Бүтээгдэхүүн хайх..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					className="h-12 w-full rounded-base border-2 border-border bg-background pr-14 pl-14 shadow-shadow"
					disabled={isPending}
				/>
				{inputValue && (
					<Button
						size="icon"
						variant="secondary"
						className="-translate-y-1/2 absolute top-1/2 right-14 h-8 w-8 rounded-base border-2 border-border hover:bg-muted"
						onClick={handleClearSearch}
						disabled={isPending}
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
				<Button
					onClick={handleSearch}
					className="-translate-y-1/2 absolute top-1/2 right-1 h-10 w-12 rounded-base border-2 border-border shadow-shadow transition-shadow hover:shadow-md"
					disabled={isPending || !inputValue.trim()}
					aria-label="Search"
				>
					{isPending ? (
						<Loader2 className="h-5 w-5 animate-spin" />
					) : (
						<Search className="h-5 w-5" />
					)}
				</Button>
			</div>
			{/* Filters */}
			<div className="flex w-full flex-row gap-2">
				<Select
					value={categoryId === undefined ? "all" : categoryId.toString()}
					onValueChange={(value) =>
						handleFilterChange(
							"categoryId",
							value === "all" ? undefined : Number.parseInt(value, 10),
						)
					}
					disabled={isPending}
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
						handleFilterChange(
							"brandId",
							value === "all" ? undefined : Number.parseInt(value, 10),
						)
					}
					disabled={isPending}
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
							onClick={handleResetFilters}
							disabled={isPending}
						>
							<RotateCcw className="mr-1 h-4 w-4" />
						</Button>
					)}
					<Button
						size="sm"
						variant={sortField === "stock" ? "default" : "outline"}
						className="h-10 rounded-base border-2 border-border px-3"
						onClick={() => handleSort("stock")}
						disabled={isPending}
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
						onClick={() => handleSort("price")}
						disabled={isPending}
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
						onClick={() => handleSort("createdAt")}
						disabled={isPending}
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

				<Link to="/products/add" disabled={isPending}>
					<Button className="h-10 gap-2 rounded-base border-2 border-border bg-primary px-4 shadow-shadow hover:bg-primary/90">
						<PlusCircle className="h-5 w-5" />
						<span className="hidden sm:inline">Бүтээгдэхүүн нэмэх</span>
						<span className="sm:hidden">Нэмэх</span>
					</Button>
				</Link>
			</div>

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
				{!isPending && products.length === 0 && (
					<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
						{searchTerm
							? `"${searchTerm}" олдсонгүй`
							: "Бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилнө үү."}
					</div>
				)}
				{!isPending && products.length > 0 && (
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
		</div>
	);
}

function RouteComponent() {
	return (
		<Suspense fallback={<ProductsPageSkeleton />}>
			<ProductsContent />
		</Suspense>
	);
}
