"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Package } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BrandsType, CategoriesType, ProductType } from "@/lib/types";
import { getStatusColor, getStockColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import RowActions from "../row-actions";

interface ProductCardProps {
	product: ProductType;
	brands: BrandsType;
	categories: CategoriesType;
}

const ProductCard = ({ product, brands, categories }: ProductCardProps) => {
	const [isEditing, setIsEditing] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [stockValue, setStockValue] = useState(product.stock);
	const queryClient = useQueryClient();
	const { mutate: setProductStock } = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		},
	});
	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		},
	});
	const deleteHelper = async (id: number) => {
		deleteProduct({ id });
	};
	const primaryImage =
		product.images.find((img) => img.isPrimary)?.url ||
		product.images[0]?.url ||
		"/placeholder.jpg";
	const brand = brands.find((b) => b.id === product.brandId);
	const category = categories.find((c) => c.id === product.categoryId);

	const handleSave = () => {
		setProductStock({ id: product.id, newStock: stockValue });
		setIsEditing(false);
	};

	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-shadow transition-all hover:shadow-md">
			<CardContent className="p-0">
				<div className="flex flex-row">
					<div className="flex h-24 w-24 shrink-0 items-center justify-center border-border border-r-2 bg-muted/30 p-3">
						<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
							<img
								src={primaryImage || "/placeholder.jpg"}
								alt={product.name}
								className="h-full w-full object-contain"
								loading="lazy"
							/>
						</div>
					</div>

					{/* Content container */}
					<div className="flex flex-1 flex-col p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								<h3 className="line-clamp-1 font-bold text-base">
									{product.name}
								</h3>
								<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
									{brand?.name && <span>{brand.name}</span>}
									{brand?.name && category?.name && <span>•</span>}
									{category?.name && <span>{category.name}</span>}
								</div>
							</div>
							<Badge
								className={`${getStatusColor(product.status)} whitespace-nowrap border-2 border-border px-2 py-1 font-bold text-xs`}
							>
								{product.status.replace("_", " ")}
							</Badge>
						</div>

						<div className="mt-2 flex items-center gap-4">
							<div className="font-bold text-lg">
								${product.price.toFixed(2)}
							</div>
							<div
								className={`flex items-center ${getStockColor(product.stock)}`}
							>
								<Package className="mr-1 h-4 w-4" />
								<span className="font-bold text-sm">{product.stock}</span>
								<span className="ml-1 text-xs">in stock</span>
							</div>
						</div>

						<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
							{isEditing ? (
								<div className="flex items-center gap-2">
									<Input
										className="h-8 w-20 border-2 border-border text-center text-sm"
										value={stockValue}
										type="number"
										min="0"
										onChange={(e) => {
											const value =
												e.target.value === ""
													? 0
													: Number.parseInt(e.target.value);
											setStockValue(Math.max(0, value));
										}}
									/>
									<Button
										onClick={handleSave}
										size="sm"
										className="h-8 border-2 border-border px-3 text-sm"
									>
										Save
									</Button>
								</div>
							) : (
								<Button
									variant="secondary"
									size="sm"
									onClick={() => setIsEditing(true)}
									className="h-8 border-2 border-border px-3 text-sm"
								>
									<Edit className="mr-1 h-4 w-4" />
									Edit Stock
								</Button>
							)}

							<RowActions
								id={product.id}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={deleteHelper}
								isDeletePending={isDeletePending}
							/>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};

export default ProductCard;
