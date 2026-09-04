import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatProductStatusMn } from "@vit/shared/domain/product";
import { Eye, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BrandsType, CategoriesType, ProductType } from "@/lib/types";
import { invalidateProductCaches, patchProductInCaches } from "@/utils/product-cache";
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
import { DropdownMenuItem, DropdownMenuSeparator } from "../ui/dropdown-menu";
import { ProductPriceEditor, ProductStockEditor } from "./product-card-editors";
import { ProductSummary } from "./product-card-summary";
import ProductForm from "./product-form";

interface ProductCardProps {
	product: ProductType;
	brands: BrandsType;
	categories: CategoriesType;
}

const ProductCard = ({ product, brands, categories }: ProductCardProps) => {
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
		if (!isStockEditing) setStockValue(product.stock);
		if (!isPriceEditing) setPriceValue(product.price);
	}, [product.stock, product.price, isStockEditing, isPriceEditing]);

	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const {
		mutate: setProductStock,
		isPending: isSetStockPending,
		variables: setStockVariables,
	} = useMutation({
		...trpc.product.setProductStock.mutationOptions(),
		onError: () => {
			toast.error("Үлдэгдэл шинэчлэхэд алдаа гарлаа");
			setStockValue(product.stock);
			void invalidateProductCaches(queryClient, product.id);
		},
		onMutate: async ({ id, newStock }) => {
			await queryClient.cancelQueries({
				queryKey: ["admin-products-infinite"],
			});
			patchProductInCaches(queryClient, id, { stock: newStock });
			return undefined;
		},
		// Patch owns the infinite list; skip refetching it so the dash scroller
		// doesn't jump to the top. Still invalidate search/detail on settle.
		onSettled: async () => {
			await invalidateProductCaches(queryClient, product.id, {
				skipInfiniteList: true,
			});
			setIsStockEditing(false);
		},
	});
	const {
		mutate: setProductPrice,
		isPending: isSetPricePending,
		variables: setPriceVariables,
	} = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onError: () => {
			toast.error("Үнэ шинэчлэхэд алдаа гарлаа");
			setPriceValue(product.price);
			void invalidateProductCaches(queryClient, product.id);
		},
		onMutate: async ({ id, numberValue }) => {
			if (numberValue === undefined) {
				return undefined;
			}
			await queryClient.cancelQueries({
				queryKey: ["admin-products-infinite"],
			});
			patchProductInCaches(queryClient, id, { price: numberValue });
			return undefined;
		},
		onSettled: async () => {
			await invalidateProductCaches(queryClient, product.id, {
				skipInfiniteList: true,
			});
			setIsPriceEditing(false);
		},
	});
	const { mutate: updateProductField, isPending: isUpdateFieldPending } =
		useMutation({
			...trpc.product.updateProductField.mutationOptions(),
			onSuccess: async () => {
				await invalidateProductCaches(queryClient, product.id);
				setIsActivateConfirmOpen(false);
			},
		});
	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
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
		isSetStockPending && setStockVariables
			? setStockVariables.newStock
			: stockValue;
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
			id: product.id,
			field: "price",
			numberValue: priceValue,
		});
	};

	const openProductDetails = () => {
		navigate({ to: "/products/$id", params: { id: String(product.id) } });
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
			id: product.id,
			field: "status",
			stringValue: "active",
		});
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
							product={{
								...product,
								brandId: String(product.brandId),
								categoryId: String(product.categoryId),
								name_mn: product.name_mn ?? undefined,
								seoTitle: product.seoTitle ?? undefined,
								seoDescription: product.seoDescription ?? undefined,
								ingredients: product.ingredients ?? undefined,
								tags: product.tags ?? undefined,
							}}
							onSuccess={() => {
								setIsEditDialogOpen(false);
								void invalidateProductCaches(queryClient, product.id);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Card className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none">
				<CardContent className="p-0">
					<ProductSummary
						product={product}
						currentStock={displayStock}
						currentPrice={displayPrice}
						primaryImage={primaryImage}
						brandName={brand?.name}
						categoryName={category?.name}
						isOutOfStock={isOutOfStock}
						statusLabel={statusLabel}
						onOpen={openProductDetails}
						onRequestActivateConfirm={
							product.status === "active"
								? undefined
								: () => setIsActivateConfirmOpen(true)
						}
					/>
					<AlertDialog
						open={isActivateConfirmOpen}
						onOpenChange={setIsActivateConfirmOpen}
					>
						<AlertDialogContent className="border-2 border-border bg-background shadow-shadow">
							<AlertDialogHeader>
								<AlertDialogTitle className="font-heading text-lg">
									Бүтээгдэхүүнийг идэвхжүүлэх
								</AlertDialogTitle>
								<AlertDialogDescription>
									«{product.name}»-ийг идэвхтэй төлөвт оруулах уу? Дэлгүүрт
									харагдана.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter className="mt-6 flex gap-3">
								<AlertDialogCancel asChild>
									<Button variant="outline" className="flex-1">
										Цуцлах
									</Button>
								</AlertDialogCancel>
								<AlertDialogAction asChild>
									<Button
										className="flex-1"
										onClick={handleConfirmActivateProduct}
										disabled={isUpdateFieldPending}
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
								stock={product.stock}
								value={stockValue}
								isPending={isSetStockPending}
								onValueChange={setStockValue}
								onEdit={() => setIsStockEditing(true)}
								onCancel={() => setIsStockEditing(false)}
								onSave={handleSaveStock}
							/>

							<ProductPriceEditor
								isEditing={isPriceEditing}
								price={product.price}
								value={priceValue}
								isPending={isSetPricePending}
								onValueChange={setPriceValue}
								onEdit={() => setIsPriceEditing(true)}
								onCancel={() => setIsPriceEditing(false)}
								onSave={handleSavePrice}
							/>

							<RowActions
								id={product.id}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={(id) => deleteProduct({ id })}
								isDeletePending={isDeletePending}
								extraActions={
									<>
										<AlertDialog
											open={isOutOfStockAlertOpen}
											onOpenChange={setIsOutOfStockAlertOpen}
										>
											<AlertDialogTrigger asChild>
												<DropdownMenuItem
													className="cursor-pointer gap-2 py-2 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
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
											<AlertDialogContent className="border-2 border-border bg-background shadow-shadow">
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
														<Button variant="outline" className="flex-1">
															Цуцлах
														</Button>
													</AlertDialogCancel>
													<AlertDialogAction asChild>
														<Button
															className="flex-1"
															onClick={handleMarkOutOfStock}
															disabled={isSetStockPending}
														>
															Тэглэх
														</Button>
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
										<DropdownMenuSeparator className="bg-border" />
										<DropdownMenuItem
											className="cursor-pointer gap-2 py-2 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
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
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default ProductCard;
