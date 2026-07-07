import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	DollarSign,
	Eye,
	Info,
	Package,
	ShoppingCart,
} from "lucide-react";
import { Suspense, useState } from "react";
import { EditableField } from "@/components/editable-field";
import ProductDetailSkeleton from "@/components/product/product-detail-skeleton";
import ProductForm from "@/components/product/product-form";
import RowAction from "@/components/row-actions";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductDetailMutations } from "@/features/products/detail/hooks/use-product-detail-mutations";
import { useProductFeaturedImage } from "@/features/products/detail/hooks/use-product-featured-image";
import {
	AnalyticsSkeleton,
	ProductAnalyticsSection,
	ProductBehaviorStatCards,
} from "@/features/products/detail/sections/product-analytics-section";
import { ProductDetailImagesSection } from "@/features/products/detail/sections/product-images-section";
import {
	OrdersSkeleton,
	ProductOrdersSection,
} from "@/features/products/detail/sections/product-orders-section";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

function formatExpirationMonthYear(value?: string | null) {
	if (!value) return "Тодорхойлоогүй";
	const [year, month] = value.split("-");
	if (!year || !month) return value;
	return `${month}/${year}`;
}

export function ProductDetailPage({ productId }: { productId: number }) {
	const queryClient = useQueryClient();
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { data: product } = useSuspenseQuery({
		...trpc.product.getProductById.queryOptions({ id: productId }),
	});

	const {
		featuredImageIndex,
		setFeaturedImageIndex,
		currentFeaturedImage,
	} = useProductFeaturedImage(product.images);

	const {
		isDeletePending,
		updateProductField,
		isUpdateProductFieldPending,
		deleteImage,
		isDeleteImagePending,
		addImage,
		regenerateProductImages,
		isRegenerateProductImagesPending,
		setPrimaryImage,
		isSetPrimaryImagePending,
		deleteHelper,
	} = useProductDetailMutations(productId, {
		onRegenerateSuccess: () => setFeaturedImageIndex(0),
	});

	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Бүтээгдэхүүний дэлгэрэнгүй</DialogTitle>
						<DialogDescription>
							Бүтээгдэхүүний дэлгэрэнгүй мэдээлэл
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
						{isEditDialogOpen ? (
							<Suspense fallback={<ProductDetailSkeleton />}>
								<ProductForm
									product={{
										...product,
										brandId: String(product.brandId),
										categoryId: String(product.categoryId),
										name_mn: product.name_mn ?? undefined,
										seoTitle: product.seoTitle ?? undefined,
										seoDescription: product.seoDescription ?? undefined,
										expirationDate: product.expirationDate ?? undefined,
									}}
									onSuccess={() => {
										setIsEditDialogOpen(false);
										queryClient.invalidateQueries({
											queryKey: ["admin-products-infinite"],
											type: "all",
										});
										queryClient.invalidateQueries(
											trpc.product.getAllProducts.queryOptions(),
										);
									}}
								/>
							</Suspense>
						) : null}
					</div>
				</DialogContent>
			</Dialog>

			<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
				<div className="mx-auto w-full max-w-7xl">
					<div className="mb-6 sm:mb-8">
						<div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
							<Link
								to="/products"
								className="flex items-center gap-1.5 transition-colors hover:text-foreground"
							>
								<ArrowLeft className="h-3.5 w-3.5" />
								Бүтээгдэхүүн
							</Link>
							<span>/</span>
							<span className="max-w-[200px] truncate text-foreground">
								{product.name}
							</span>
						</div>

						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<h1 className="truncate font-heading text-xl sm:text-2xl md:text-3xl">
										{product.name}
									</h1>
								</div>
								<p className="mt-1 font-mono text-muted-foreground text-xs sm:text-sm">
									{product.slug}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<EditableField
									label=""
									type="select"
									value={product.status}
									options={[
										{ value: "active", label: "Идэвхтэй" },
										{ value: "draft", label: "Ноорог" },
										{ value: "out_of_stock", label: "Дууссан" },
									]}
									className={`rounded-full border px-3 py-1 font-medium text-sm ${getStatusColor(product.status)}`}
									isLoading={isUpdateProductFieldPending}
									onSave={async (next) => {
										await updateProductField({
											id: productId,
											field: "status",
											stringValue: next,
										});
									}}
								/>
								<RowAction
									id={productId}
									setIsEditDialogOpen={setIsEditDialogOpen}
									deleteMutation={deleteHelper}
									isDeletePending={isDeletePending}
								/>
							</div>
						</div>
					</div>

					{product.stock < 10 && (
						<div className="mb-6 flex items-center gap-3 border-2 border-destructive bg-destructive/10 p-3 sm:p-4">
							<AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
							<div className="min-w-0 flex-1">
								<span className="font-bold font-heading text-destructive text-sm">
									Нөөц дуусч байна
								</span>
								<span className="ml-2 text-destructive/80 text-sm">
									Зөвхөн {product.stock} ширхэг үлдсэн. Удахгүй нөөц нэмэх
									хэрэгтэй.
								</span>
							</div>
						</div>
					)}

					<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-primary/20">
									<DollarSign className="h-4 w-4 text-primary-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-bold font-heading text-sm sm:text-base">
										{formatCurrency(Number(product.price))}
									</p>
									<p className="text-muted-foreground text-xs">Үнэ</p>
								</div>
							</div>
						</div>
						<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
							<div className="flex items-center gap-2">
								<div
									className={`flex h-8 w-8 items-center justify-center border-2 border-border ${product.stock < 10 ? "bg-destructive/20" : "bg-[#00ff88]/20"}`}
								>
									<Package
										className={`h-4 w-4 ${product.stock < 10 ? "text-destructive" : "text-foreground"}`}
									/>
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-bold font-heading text-sm sm:text-base">
										{product.stock}
									</p>
									<p className="text-muted-foreground text-xs">Нөөц</p>
								</div>
							</div>
						</div>
						<Suspense
							fallback={
								<>
									<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
										<div className="flex items-center gap-2">
											<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-purple-100">
												<Eye className="h-4 w-4 text-purple-600" />
											</div>
											<div className="min-w-0 flex-1">
												<Skeleton className="h-5 w-12" />
												<p className="text-muted-foreground text-xs">Үзэлт</p>
											</div>
										</div>
									</div>
									<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
										<div className="flex items-center gap-2">
											<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-blue-100">
												<ShoppingCart className="h-4 w-4 text-blue-600" />
											</div>
											<div className="min-w-0 flex-1">
												<Skeleton className="h-5 w-12" />
												<p className="text-muted-foreground text-xs">Хувь</p>
											</div>
										</div>
									</div>
								</>
							}
						>
							<ProductBehaviorStatCards productId={productId} />
						</Suspense>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						<div className="space-y-6 lg:col-span-2">
							<ProductDetailImagesSection
								productId={productId}
								product={product}
								featuredImageIndex={featuredImageIndex}
								currentFeaturedImage={currentFeaturedImage}
								onFeaturedImageChange={setFeaturedImageIndex}
								regenerateProductImages={regenerateProductImages}
								isRegenerateProductImagesPending={
									isRegenerateProductImagesPending
								}
								addImage={addImage}
								setPrimaryImage={setPrimaryImage}
								isSetPrimaryImagePending={isSetPrimaryImagePending}
								deleteImage={deleteImage}
								isDeleteImagePending={isDeleteImagePending}
							/>

							<div className="border-2 border-border bg-card shadow-hard">
								<div className="border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="flex items-center gap-2 font-heading text-base sm:text-lg">
										<Package className="h-4 w-4" />
										Үндсэн мэдээлэл
									</h2>
								</div>

								<div className="divide-y-2 divide-border">
									<div className="px-4 py-4 sm:px-6">
										<EditableField
											label="Нэр:"
											value={product.name}
											isLoading={isUpdateProductFieldPending}
											onSave={async (next) => {
												await updateProductField({
													id: productId,
													field: "name",
													stringValue: next,
												});
											}}
										/>
									</div>

									<div className="px-4 py-4 sm:px-6">
										<EditableField
											label="Тайлбар:"
											type="textarea"
											value={product.description}
											isLoading={isUpdateProductFieldPending}
											onSave={async (next) => {
												await updateProductField({
													id: productId,
													field: "description",
													stringValue: next,
												});
											}}
										/>
									</div>

									<div className="grid grid-cols-1 divide-y-2 divide-border sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
										<div className="px-4 py-4 sm:px-6">
											<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
												<span className="w-24 shrink-0 font-semibold text-muted-foreground text-sm sm:w-32">
													Ангилал:
												</span>
												<span className="font-medium text-base">
													{product.category?.name || (
														<span className="text-muted-foreground/50">
															Тодорхойлоогүй
														</span>
													)}
												</span>
											</div>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
												<span className="w-24 shrink-0 font-semibold text-muted-foreground text-sm sm:w-32">
													Брэнд:
												</span>
												<span className="font-medium text-base">
													{product.brand?.name || (
														<span className="text-muted-foreground/50">
															Тодорхойлоогүй
														</span>
													)}
												</span>
											</div>
										</div>
									</div>

									<div className="grid grid-cols-1 divide-y-2 divide-border sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Үнэ:"
												type="number"
												value={product.price}
												format={(v) => formatCurrency(Number(v))}
												parse={(raw) =>
													Number.parseFloat(raw || "0") as never
												}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "price",
														numberValue: next,
													});
												}}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Нөөц:"
												type="number"
												value={product.stock}
												parse={(raw) =>
													Number.parseInt(
														raw || "0",
														10,
													) as unknown as string as never
												}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "stock",
														numberValue: next,
													});
												}}
											/>
										</div>
									</div>
								</div>
							</div>

							<div className="border-2 border-border bg-card shadow-hard">
								<div className="border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="flex items-center gap-2 font-heading text-base sm:text-lg">
										<Info className="h-4 w-4" />
										Нэмэлт мэдээлэл
									</h2>
								</div>

								<div className="grid grid-cols-1 divide-y-2 divide-border sm:grid-cols-2 sm:divide-y-0">
									<div className="divide-y-2 divide-border sm:border-border sm:border-r-2">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Хэмжээ:"
												value={product.amount}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "amount",
														stringValue: next,
													});
												}}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Идэмхий чанар:"
												value={product.potency}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "potency",
														stringValue: next,
													});
												}}
											/>
										</div>
									</div>
									<div className="divide-y-2 divide-border">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Дуусах хугацаа:"
												type="month"
												value={product.expirationDate || ""}
												format={(value) =>
													formatExpirationMonthYear(value || null)
												}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "expirationDate" as never,
														stringValue: next || undefined,
													});
												}}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Өдрийн хэрэглээ:"
												type="number"
												value={product.dailyIntake}
												parse={(raw) =>
													Number.parseFloat(
														raw || "0",
													) as unknown as string as never
												}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "dailyIntake",
														numberValue: next,
													});
												}}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Хөнгөлөлт:"
												type="number"
												value={product.discount}
												format={(value) => `${value}%`}
												parse={(raw) =>
													Number.parseInt(
														raw || "0",
														10,
													) as unknown as string as never
												}
												isLoading={isUpdateProductFieldPending}
												onSave={async (next) => {
													await updateProductField({
														id: productId,
														field: "discount",
														numberValue: next,
													});
												}}
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-6">
							<Suspense fallback={<AnalyticsSkeleton />}>
								<ProductAnalyticsSection productId={productId} />
							</Suspense>

							<Suspense fallback={<OrdersSkeleton />}>
								<ProductOrdersSection productId={productId} />
							</Suspense>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
