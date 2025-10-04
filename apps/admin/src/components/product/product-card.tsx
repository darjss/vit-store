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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import ProductForm from "./product-form";
import { Link } from "@tanstack/react-router";

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
			queryClient.invalidateQueries({
				...trpc.product.getPaginatedProducts.queryKey,
			});
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

	const handleSave = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		setProductStock({ id: product.id, newStock: stockValue });
		setIsEditing(false);
	};

	const handleLinkClick = (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest("[data-no-nav]")) {
			e.preventDefault();
		}
	};

	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Бүтээгдэхүүн засах</DialogTitle>
						<DialogDescription>
							Бүтээгдэхүүний дэлгэрэнгүйг засах.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
						<ProductForm
							product={product}
							onSuccess={() => {
								setIsEditDialogOpen(false);
								queryClient.invalidateQueries(
									trpc.product.getAllProducts.queryOptions(),
								);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Link
				to={`/products/$id`}
				params={{ id: product.id }}
				onClickCapture={handleLinkClick}
			>
				<Card className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none">
					<CardContent className="p-0">
						<div className="flex flex-row">
							<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
								<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
									<img
										src={primaryImage || "/placeholder.jpg"}
										alt={product.name}
										className="h-full w-full object-contain"
										loading="lazy"
									/>
								</div>
							</div>

							<div className="flex flex-1 flex-col p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<h3 className="font-bold text-base break-words">
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

								<div className="mt-1 flex items-center gap-3">
									<div className="font-bold text-lg">
										${product.price.toFixed(2)}
									</div>
									<div
										className={`flex items-center ${getStockColor(product.stock)}`}
									>
										<Package className="mr-1 h-4 w-4" />
										<span className="font-bold text-sm">{product.stock}</span>
										<span className="ml-1 text-xs">үлдэгдэл</span>
									</div>
								</div>

								<div
									data-no-nav
									className="mt-2 flex flex-wrap items-center justify-between gap-2"
								>
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
												Хадгалах
											</Button>
										</div>
									) : (
										<Button
											variant="secondary"
											size="sm"
											onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
												e.stopPropagation();
												setIsEditing(true);
											}}
											className="h-8 border-2 border-border px-3 text-sm"
										>
											<Edit className="mr-1 h-4 w-4" />
											үлдэгдэл засах
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
			</Link>
		</>
	);
};

export default ProductCard;
