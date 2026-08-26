import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import ProductCard from "./product-card";

export function ProductCardById({ productId }: { productId: number }) {
	const productQuery = useQuery(
		trpc.product.getProductById.queryOptions({ id: productId }),
	);
	const brandsQuery = useQuery(trpc.brands.getAllBrands.queryOptions());
	const categoriesQuery = useQuery(
		trpc.category.getAllCategories.queryOptions(),
	);

	if (
		productQuery.isPending ||
		brandsQuery.isPending ||
		categoriesQuery.isPending
	) {
		return <ProductCardLoading />;
	}

	if (productQuery.isError || brandsQuery.isError || categoriesQuery.isError) {
		const isNotFound = productQuery.error?.data?.code === "NOT_FOUND";
		return (
			<div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-base border-2 border-border p-6 text-center">
				<AlertCircle className="h-5 w-5 text-muted-foreground" />
				<p className="text-muted-foreground text-sm">
					{isNotFound
						? "Бүтээгдэхүүн олдсонгүй"
						: "Бүтээгдэхүүний мэдээллийг ачаалж чадсангүй"}
				</p>
				{!isNotFound && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							void productQuery.refetch();
							void brandsQuery.refetch();
							void categoriesQuery.refetch();
						}}
					>
						<RotateCcw className="mr-2 h-4 w-4" />
						Дахин оролдох
					</Button>
				)}
			</div>
		);
	}

	return (
		<ProductCard
			product={productQuery.data}
			brands={brandsQuery.data}
			categories={categoriesQuery.data}
		/>
	);
}

function ProductCardLoading() {
	return (
		<div className="min-h-48 rounded-base border-2 border-border p-3">
			<div className="flex gap-3">
				<Skeleton className="h-20 w-20 shrink-0 rounded-base" />
				<div className="flex-1 space-y-3">
					<Skeleton className="h-5 w-3/4 rounded-base" />
					<Skeleton className="h-4 w-1/2 rounded-base" />
					<Skeleton className="h-6 w-1/3 rounded-base" />
				</div>
			</div>
		</div>
	);
}
