import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowUpDown,
	Loader2,
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";
import ProductCard from "@/components/product/product-card";
import ProductForm from "@/components/product/product-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/products")({
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
		return { products, categories, brands };
	},
});

function RouteComponent() {
	const [inputValue, setInputValue] = useState("");
	const [searchTerm] = useState("");
	const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
	const [categoryFilter] = useState(0);
	const [brandFilter] = useState(0);
	const [sortField] = useState("");
	const [hasActiveFilters] = useState(false);
	const queryClient = useQueryClient();
	const [
		{ data: productsData, isPending },
		{ data: categories },
		{ data: brands },
	] = useSuspenseQueries({
		queries: [
			trpc.product.getPaginatedProducts.queryOptions({}),
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});
	const products = productsData.products;

	const handleSearch = () => {
		console.log("search");
	};
	const handleClearSearch = () => {
		console.log("clear search");
	};
	const handleFilterChange = (field: string, value: number) => {
		console.log("filter change", field, value);
	};
	const handleResetFilters = () => {
		console.log("reset filters");
	};
	const handleSort = (field: string) => {
		console.log("sort", field);
	};
	return (
		<Card className="w-full">
			<CardContent className="space-y-6 p-2 sm:p-6">
				<div className="space-y-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
						<div className="relative flex-1">
							<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search products..."
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
								className="h-10 w-full rounded-xl bg-background pr-10 pl-8 shadow-sm"
								disabled={isPending}
							/>
							{inputValue && (
								<Button
									size="icon"
									className="-translate-y-1/2 absolute top-1/2 right-10 h-7 w-7 transform"
									onClick={handleClearSearch}
									disabled={isPending}
									aria-label="Clear search"
								>
									<X className="h-4 w-4" />
								</Button>
							)}
							<Button
								onClick={handleSearch}
								className="-translate-y-1/2 absolute top-1/2 right-0 h-10 w-10 transform rounded-l-none p-0"
								disabled={isPending || !inputValue.trim()}
								aria-label="Search"
							>
								{isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Search className="h-4 w-4" />
								)}
							</Button>
						</div>
						<div className="space-y-4">
							<div className="flex justify-end">
								<Dialog
									open={isAddProductDialogOpen}
									onOpenChange={setIsAddProductDialogOpen}
								>
									<DialogTrigger asChild>
										<Button className="gap-2 rounded-xl px-4">
											<PlusCircle className="h-4 w-4" />
											<span className="hidden sm:inline">Add Product</span>
											<span className="sm:hidden">Add</span>
										</Button>
									</DialogTrigger>
									<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
										<DialogHeader className="border-b px-6 pt-6 pb-4">
											<DialogTitle>Add Product</DialogTitle>
											<DialogDescription>
												Create a new product for your catalog.
											</DialogDescription>
										</DialogHeader>
										<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
											<ProductForm
												onSuccess={() => {
													setIsAddProductDialogOpen(false);
													queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
												}}
											/>
										</div>
									</DialogContent>
								</Dialog>
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
						<div className="flex gap-2">
							<Select
								value={categoryFilter === 0 ? "all" : categoryFilter.toString()}
								onValueChange={(value) =>
									handleFilterChange(
										"category",
										value === "all" ? 0 : Number.parseInt(value),
									)
								}
								disabled={isPending}
							>
								<SelectTrigger className="h-9 w-full rounded-xl sm:w-[160px]">
									<SelectValue placeholder="All Categories" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Categories</SelectItem>
									{categories.map((category) => (
										<SelectItem
											key={category.id}
											value={category.id.toString()}
										>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={brandFilter === 0 ? "all" : brandFilter.toString()}
								onValueChange={(value) =>
									handleFilterChange(
										"brand",
										value === "all" ? 0 : Number.parseInt(value),
									)
								}
								disabled={isPending}
							>
								<SelectTrigger className="h-9 w-full rounded-xl sm:w-[160px]">
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
						<div className="flex items-center gap-2 sm:ml-auto">
							{(hasActiveFilters || sortField !== "") && (
								<Button
									size="sm"
									className="h-9 px-3 text-xs"
									onClick={handleResetFilters}
									disabled={isPending}
								>
									<RotateCcw className="mr-1 h-3 w-3" />
									Reset
								</Button>
							)}
							<Button
								size="sm"
								className="h-9 px-3"
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
								className="h-9 px-3"
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
								className="h-9 px-3"
								onClick={() => handleSort("createdAt")}
								disabled={isPending}
							>
								Date
								<ArrowUpDown
									className={`ml-1 h-4 w-4 ${sortField === "createdAt" ? "opacity-100" : "opacity-50"}`}
								/>
							</Button>
						</div>
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
						<div className="rounded-xl border p-8 text-center text-muted-foreground">
							{searchTerm
								? `No products found matching "${searchTerm}"`
								: "No products found. Try adjusting filters."}
						</div>
					)}
					{!isPending && products.length > 0 && (
						<>
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

							{/* <DataPagination
							
							/> */}
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
