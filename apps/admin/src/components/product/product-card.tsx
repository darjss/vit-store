import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Eye, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BrandsType, CategoriesType, ProductType } from "@/lib/types";
import { formatProductStatusMn } from "@vit/shared/domain/product";
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
import ProductForm from "./product-form";
import { ProductSummary } from "./product-card-summary";
import { ProductExpirationEditor, ProductStockEditor } from "./product-card-editors";

interface ProductCardProps {
	product: ProductType;
	brands: BrandsType;
	categories: CategoriesType;
}

const ProductCard = ({ product, brands, categories }: ProductCardProps) => {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isStockEditing, setIsStockEditing] = useState(false);
	const [isExpEditing, setIsExpEditing] = useState(false);
	const [isOutOfStockAlertOpen, setIsOutOfStockAlertOpen] = useState(false);
	const [isActivateConfirmOpen, setIsActivateConfirmOpen] = useState(false);
	const [stockValue, setStockValue] = useState(product.stock);
	const [expValue, setExpValue] = useState(product.expirationDate ?? "");

	useEffect(() => {
		setStockValue(product.stock);
		setExpValue(product.expirationDate ?? "");
	}, [product.stock, product.expirationDate]);

	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const previousStockRef = useRef<number>(0);
	const { mutate: setProductStock, isPending: isSetProductStockPending } =
		useMutation({
			...trpc.product.setProductStock.mutationOptions(),
			onMutate: async (variables) => {
				await queryClient.cancelQueries({
					queryKey: ["admin-products-infinite"],
				});

				previousStockRef.current = stockValue;
				setStockValue(variables.newStock);

				queryClient.setQueriesData(
					{ queryKey: ["admin-products-infinite"], type: "all" },
					(old: { pages: { products: { id: number; stock: number }[] }[] } | undefined) => {
						if (!old) return old;
						return {
							...old,
							pages: old.pages.map((page) => ({
								...page,
								products: page.products.map((p) =>
									p.id === variables.id
										? { ...p, stock: variables.newStock }
										: p,
								),
							})),
						};
					},
				);

				setIsStockEditing(false);
				return undefined;
			},
			onError: () => {
				setStockValue(previousStockRef.current);
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: ["admin-products-infinite"],
					type: "all",
				});
			},
		});
	const { mutate: updateProductField, isPending: isUpdateFieldPending } =
		useMutation({
			...trpc.product.updateProductField.mutationOptions(),
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: ["admin-products-infinite"],
					type: "all",
				});
				setIsExpEditing(false);
				setIsActivateConfirmOpen(false);
			},
		});
	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["admin-products-infinite"],
				type: "all",
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
	const isOutOfStock = stockValue === 0 || product.status === "out_of_stock";
	const statusLabel = formatProductStatusMn(product.status, isOutOfStock);

	const handleSaveStock = () => {
		setProductStock({ id: product.id, newStock: stockValue });
	};

	const handleSaveExpDate = () => {
		updateProductField({
			id: product.id,
			field: "expirationDate" as never,
			stringValue: expValue || undefined,
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
			field: "status" as never,
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
								void queryClient.invalidateQueries({
									queryKey: ["admin-products-infinite"],
									type: "all",
								});
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Card className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none">
				<CardContent className="p-0">
					<ProductSummary
						product={product}
						currentStock={stockValue}
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
								isPending={isSetProductStockPending}
								onValueChange={setStockValue}
								onEdit={() => setIsStockEditing(true)}
								onCancel={() => setIsStockEditing(false)}
								onSave={handleSaveStock}
							/>

							<ProductExpirationEditor
								isEditing={isExpEditing}
								expirationDate={product.expirationDate}
								value={expValue}
								isPending={isUpdateFieldPending}
								onValueChange={setExpValue}
								onEdit={() => setIsExpEditing(true)}
								onCancel={() => setIsExpEditing(false)}
								onSave={handleSaveExpDate}
							/>

							<RowActions
								id={product.id}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={deleteHelper}
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
													disabled={
														isSetProductStockPending || product.stock === 0
													}
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
															disabled={isSetProductStockPending}
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
