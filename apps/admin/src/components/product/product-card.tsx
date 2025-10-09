import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../ui/alert-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import ProductForm from "./product-form";

interface ProductCardProps {
	product: ProductType;
	brands: BrandsType;
	categories: CategoriesType;
}

const ProductCard = ({ product, brands, categories }: ProductCardProps) => {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
	const [stockValue, setStockValue] = useState(product.stock);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
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

	const handleSaveStock = () => {
		setProductStock({ id: product.id, newStock: stockValue });
		setIsStockDialogOpen(false);
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
			<Card
				className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none"
				onClick={(e) => {
					if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
					navigate({ to: "/products/$id", params: { id: product.id } });
				}}
				
				tabIndex={0}
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						!(e.target as HTMLElement).closest("[data-no-nav]")
					) {
						navigate({ to: "/products/$id", params: { id: product.id } });
					}
				}}
			>
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
									<h3 className="break-words font-bold text-base">
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
								<AlertDialog
									open={isStockDialogOpen}
									onOpenChange={setIsStockDialogOpen}
								>
									<AlertDialogTrigger asChild>
										<Button
											variant="secondary"
											size="sm"
											onClick={(e) => e.stopPropagation()}
											className="h-8 border-2 border-border px-3 text-sm"
										>
											<Edit className="mr-1 h-4 w-4" />
											үлдэгдэл засах
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Үлдэгдэл засах</AlertDialogTitle>
											<AlertDialogDescription>
												"{product.name}" бүтээгдэхүүний үлдэгдлийн тоог оруулна
												уу.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<div className="py-4">
											<Input
												className="w-full border-2 border-border text-center"
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
										</div>
										<AlertDialogFooter>
											<AlertDialogCancel>Цуцлах</AlertDialogCancel>
											<AlertDialogAction onClick={handleSaveStock}>
												Хадгалах
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>

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
		</>
	);
};

export default ProductCard;
