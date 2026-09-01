import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatProductStatusMn } from "@vit/shared/domain/product";
import { Eye, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BrandsType, CategoriesType, ProductType } from "@/lib/types";
import { invalidateProductCaches } from "@/utils/product-cache";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "../ui/dropdown-menu";
import { ProductPriceEditor, ProductStockEditor } from "./product-card-editors";
import { ProductSummary } from "./product-card-summary";
import ProductForm from "./product-form";

interface ProductCardProps {
	brands: BrandsType;
	categories: CategoriesType;
	product: ProductType;
}

const ProductCard = ({ brands, categories, product }: ProductCardProps) => {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isStockEditing, setIsStockEditing] = useState(false);
	const [isPriceEditing, setIsPriceEditing] = useState(false);
	const [isOutOfStockAlertOpen, setIsOutOfStockAlertOpen] = useState(false);
	const [isActivateConfirmOpen, setIsActivateConfirmOpen] = useState(false);
	const [stockValue, setStockValue] = useState(product.stock);
	const [priceValue, setPriceValue] = useState(product.price);

	// Sync drafts from the cache only while their editor is closed, so an
	// unrelated refetch (e.g. saving stock) can't wipe a price being typed,
	// and vice versa.
	useEffect(() => {
		if (!isStockEditing) {
			setStockValue(product.stock);
		}
		if (!isPriceEditing) {
			setPriceValue(product.price);
		}
	}, [product.stock, product.price, isStockEditing, isPriceEditing]);

	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const {
		isPending: isSetStockPending,
		mutate: setProductStock,
		variables: setStockVariables,
	} = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onError: () => {
			toast.error("Үлдэгдэл шинэчлэхэд алдаа гарлаа");
			setStockValue(product.stock);
		},
		onSettled: () => {
			invalidateProductCaches(queryClient, product.id);
		},
		onSuccess: () => {
			setIsStockEditing(false);
		},
	});
	const {
		isPending: isSetPricePending,
		mutate: setProductPrice,
		variables: setPriceVariables,
	} = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onError: () => {
			toast.error("Үнэ шинэчлэхэд алдаа гарлаа");
			setPriceValue(product.price);
		},
		// Close the editor only once the cache reflects the saved price, so
		// the collapsed button never shows a stale value next to a fresh one
		// in the summary.
		onSettled: async () => {
			await invalidateProductCaches(queryClient, product.id);
			setIsPriceEditing(false);
		},
	});
	const { isPending: isUpdateFieldPending, mutate: updateProductField } = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onSuccess: async () => {
			await invalidateProductCaches(queryClient, product.id);
			setIsActivateConfirmOpen(false);
		},
	});
	const { isPending: isDeletePending, mutate: deleteProduct } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: async () => {
			await invalidateProductCaches(queryClient);
		},
	});
	const primaryImage =
		product.images.find((img) => img.isPrimary)?.url ||
		product.images[0]?.url ||
		"/placeholder.jpg";
	const brand = brands.find((b) => b.id === product.brandId);
	const category = categories.find((c) => c.id === product.categoryId);
	// Show the attempted value while the save is in flight; on failure this
	// reverts automatically because stockValue is only synced from the cache.
	const displayStock =
		isSetStockPending && setStockVariables ? setStockVariables.newStock : stockValue;
	const isOutOfStock = displayStock === 0 || product.status === "out_of_stock";
	const statusLabel = formatProductStatusMn(product.status, isOutOfStock);
	// Show the attempted value while the save is in flight; on failure this
	// reverts automatically because priceValue is only synced from the cache.
	const displayPrice =
		isSetPricePending && setPriceVariables
			? (setPriceVariables.numberValue ?? priceValue)
			: priceValue;

	const handleSaveStock = () => {
		setProductStock({ id: product.id, newStock: stockValue });
	};

	const handleSavePrice = () => {
		setProductPrice({
			field: "price",
			id: product.id,
			numberValue: priceValue,
		});
	};

	const openProductDetails = () => {
		navigate({ params: { id: String(product.id) }, to: "/products/$id" });
	};

	const openProductDetailsInNewPage = () => {
		window.open(`/products/${product.id}`, "_blank", "noopener,noreferrer");
	};

	const handleMarkOutOfStock = () => {
		setProductStock({ id: product.id, newStock: 0 });
		setIsOutOfStockAlertOpen(false);
	};

	const handleConfirmActivateProduct = () => {
		updateProductField({
			field: "status",
			id: product.id,
			stringValue: "active",
		});
	};

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Бүтээгдэхүүн засах</DialogTitle>
						<DialogDescription>Бүтээгдэхүүний дэлгэрэнгүйг засах.</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
						<ProductForm
							onSuccess={() => {
								setIsEditDialogOpen(false);
								void invalidateProductCaches(queryClient, product.id);
							}}
							product={{
								...product,
								brandId: String(product.brandId),
								categoryId: String(product.categoryId),
								ingredients: product.ingredients ?? undefined,
								name_mn: product.name_mn ?? undefined,
								seoDescription: product.seoDescription ?? undefined,
								seoTitle: product.seoTitle ?? undefined,
								tags: product.tags ?? undefined,
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Card className="border-border bg-card overflow-hidden border-2 shadow-none transition-all hover:shadow-none">
				<CardContent className="p-0">
					<ProductSummary
						brandName={brand?.name}
						categoryName={category?.name}
						currentPrice={displayPrice}
						currentStock={displayStock}
						isOutOfStock={isOutOfStock}
						onOpen={openProductDetails}
						onRequestActivateConfirm={
							product.status === "active" ? undefined : () => setIsActivateConfirmOpen(true)
						}
						primaryImage={primaryImage}
						product={product}
						statusLabel={statusLabel}
					/>
					<AlertDialog onOpenChange={setIsActivateConfirmOpen} open={isActivateConfirmOpen}>
						<AlertDialogContent className="border-border bg-background shadow-shadow border-2">
							<AlertDialogHeader>
								<AlertDialogTitle className="font-heading text-lg">
									Бүтээгдэхүүнийг идэвхжүүлэх
								</AlertDialogTitle>
								<AlertDialogDescription>
									«{product.name}»-ийг идэвхтэй төлөвт оруулах уу? Дэлгүүрт харагдана.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter className="mt-6 flex gap-3">
								<AlertDialogCancel asChild>
									<Button className="flex-1" variant="outline">
										Цуцлах
									</Button>
								</AlertDialogCancel>
								<AlertDialogAction asChild>
									<Button
										className="flex-1"
										disabled={isUpdateFieldPending}
										onClick={handleConfirmActivateProduct}
									>
										Идэвхжүүлэх
									</Button>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<div className="border-border border-t-2 p-3" data-no-nav>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<ProductStockEditor
								isEditing={isStockEditing}
								isPending={isSetStockPending}
								onCancel={() => setIsStockEditing(false)}
								onEdit={() => setIsStockEditing(true)}
								onSave={handleSaveStock}
								onValueChange={setStockValue}
								stock={product.stock}
								value={stockValue}
							/>

							<ProductPriceEditor
								isEditing={isPriceEditing}
								isPending={isSetPricePending}
								onCancel={() => setIsPriceEditing(false)}
								onEdit={() => setIsPriceEditing(true)}
								onSave={handleSavePrice}
								onValueChange={setPriceValue}
								price={product.price}
								value={priceValue}
							/>

							<RowActions
								deleteMutation={(id) => deleteProduct({ id })}
								extraActions={
									<>
										<AlertDialog
											onOpenChange={setIsOutOfStockAlertOpen}
											open={isOutOfStockAlertOpen}
										>
											<AlertDialogTrigger asChild>
												<DropdownMenuItem
													className="hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground cursor-pointer gap-2 py-2"
													disabled={isSetStockPending || product.stock === 0}
													onSelect={(e) => {
														e.stopPropagation();
														e.preventDefault();
														setIsOutOfStockAlertOpen(true);
													}}
												>
													<Package className="h-4 w-4" />
													<span>Үлдэгдэл тэглэх</span>
												</DropdownMenuItem>
											</AlertDialogTrigger>
											<AlertDialogContent className="border-border bg-background shadow-shadow border-2">
												<AlertDialogHeader>
													<AlertDialogTitle className="font-heading text-lg">
														Үлдэгдэл тэглэх
													</AlertDialogTitle>
													<AlertDialogDescription>
														Бүтээгдэхүүний үлдэгдлийг 0 болгоно.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter className="mt-6 flex gap-3">
													<AlertDialogCancel asChild>
														<Button className="flex-1" variant="outline">
															Цуцлах
														</Button>
													</AlertDialogCancel>
													<AlertDialogAction asChild>
														<Button
															className="flex-1"
															disabled={isSetStockPending}
															onClick={handleMarkOutOfStock}
														>
															Тэглэх
														</Button>
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
										<DropdownMenuSeparator className="bg-border" />
										<DropdownMenuItem
											className="hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground cursor-pointer gap-2 py-2"
											onSelect={(e) => {
												e.stopPropagation();
												e.preventDefault();
												openProductDetailsInNewPage();
											}}
										>
											<Eye className="h-4 w-4" />
											<span>Шинэ цонхонд нээх</span>
										</DropdownMenuItem>
									</>
								}
								id={product.id}
								isDeletePending={isDeletePending}
								setIsEditDialogOpen={setIsEditDialogOpen}
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default ProductCard;
