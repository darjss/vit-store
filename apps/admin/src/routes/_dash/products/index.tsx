import { useSuspenseQueries } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	ArrowUpDown,
	Loader2,
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import ProductCard from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PRODUCT_PER_PAGE } from "@/lib/constants";
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
		await new Promise((resolve) => setTimeout(resolve, 1000));
		console.log("products", products);
		console.log("categories", categories);
		console.log("brands", brands);
		return { products, categories, brands };
	},
	validateSearch: z.object({
		page: z.number().default(1),
		pageSize: z.number().default(PRODUCT_PER_PAGE),
		brandId: z.number().optional(),
		categoryId: z.number().optional(),
		sortField: z.string().optional(),
		sortDirection: z.enum(["asc", "desc"]).default("asc"),
		searchTerm: z.string().optional(),
	}),
});

function RouteComponent() {
	const [inputValue, setInputValue] = useState("");
	const {
		page,
		pageSize,
		brandId,
		categoryId,
		sortField,
		sortDirection,
		searchTerm,
	} = useSearch({ from: "/_dash/products/" });
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
			}),
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});
	const products = productsData.products;
	console.log("products rendered ", products);

	const handleSearch = () => {
		console.log("search");
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
				brandId: undefined,
				categoryId: undefined,
			}),
		});
	};
	const handleSort = (field: string) => {
		console.log("sort", field);
		navigate({
			to: "/products",
			search: (prev) => ({
				...prev,
				sortField: field,
			}),
		});
	};
	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-6 w-6 text-muted-foreground" />
				<Input
					placeholder="Search products..."
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
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex w-full flex-row gap-2 lg:flex-wrap">
					<Select
						value={categoryId === undefined ? "all" : categoryId.toString()}
						onValueChange={(value) =>
							handleFilterChange(
								"categoryId",
								value === "all" ? undefined : Number.parseInt(value),
							)
						}
						disabled={isPending}
					>
						<SelectTrigger className="h-10 w-full min-w-[140px] rounded-base border-2 border-border sm:w-[160px]">
							<SelectValue placeholder="All Categories" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
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
								value === "all" ? undefined : Number.parseInt(value),
							)
						}
						disabled={isPending}
					>
						<SelectTrigger className="h-10 w-full min-w-[120px] rounded-base border-2 border-border sm:w-[160px]">
							<SelectValue placeholder="All Brands" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Brands</SelectItem>
							{brands.map((brand) => (
								<SelectItem key={brand.id} value={brand.id.toString()}>
									{brand.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-row gap-2">
					{(hasActiveFilters || sortField !== "") && (
						<Button
							variant="outline"
							size="sm"
							className="h-10 rounded-base border-2 border-border px-3"
							onClick={handleResetFilters}
							disabled={isPending}
						>
							<RotateCcw className="mr-1 h-4 w-4" />
							Reset
						</Button>
					)}
					<Button
						size="sm"
						className={`h-10 rounded-base border-2 border-border px-3 ${sortField === "stock" ? "bg-muted" : "bg-background"}`}
						onClick={() => handleSort("stock")}
						disabled={isPending}
					>
						Stock
						<ArrowUpDown
							className={`ml-1 h-4 w-4 ${sortField === "stock" ? "opacity-100" : "opacity-50"}`}
						/>
					</Button>
					<Button
						size="sm"
						className={`h-10 rounded-base border-2 border-border px-3 ${sortField === "price" ? "bg-muted" : "bg-background"}`}
						onClick={() => handleSort("price")}
						disabled={isPending}
					>
						Price
						<ArrowUpDown
							className={`ml-1 h-4 w-4 ${sortField === "price" ? "opacity-100" : "opacity-50"}`}
						/>
					</Button>
					<Button
						size="sm"
						className={`h-10 rounded-base border-2 border-border px-3 ${sortField === "createdAt" ? "bg-muted" : "bg-background"}`}
						onClick={() => handleSort("createdAt")}
						disabled={isPending}
					>
						Date
						<ArrowUpDown
							className={`ml-1 h-4 w-4 ${sortField === "createdAt" ? "opacity-100" : "opacity-50"}`}
						/>
					</Button>
					<Link to="/products/add" disabled={isPending}>
						<Button
							className="h-10 gap-2 rounded-base border-2 border-border bg-primary px-4 shadow-shadow hover:bg-primary/90"
						>
							<PlusCircle className="h-5 w-5" />
							<span className="hidden sm:inline">Add Product</span>
							<span className="sm:hidden">Add</span>
						</Button>
					</Link>
				</div>
			</div>

			<div className="space-y-4">
				{isPending && (
					<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading products…</span>
					</div>
				)}
				{!isPending && products.length === 0 && (
					<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
						{searchTerm
							? `No products found matching "${searchTerm}"`
							: "No products found. Try adjusting filters."}
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
		</div>
	);
}
