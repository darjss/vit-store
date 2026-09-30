import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Bell,
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
	if (!value) {
		return "Тодорхойлоогүй";
	}
	const [year, month] = value.split("-");
	if (!year || !month) {
		return value;
	}
	return `${month}/${year}`;
}

function parseNonNegativeNumber(raw: string): number {
	const n = Number.parseFloat(raw);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseNonNegativeInt(raw: string): number {
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}
export function ProductDetailPage({ productId }: { productId: number }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { data: product } = useSuspenseQuery({
		...trpc.product.getProductById.queryOptions({ id: productId }),
	});

	const { data: restockWait } = useSuspenseQuery({
		...trpc.product.getRestockWaitCount.queryOptions({ productId }),
	});

	const { currentFeaturedImage, featuredImageIndex, setFeaturedImageIndex } =
		useProductFeaturedImage(product.images);

	const {
		addImage,
		deleteImage,
		deleteProduct,
		isDeleteImagePending,
		isDeletePending,
		isRegenerateProductImagesPending,
		isSetPrimaryImagePending,
		isUpdateProductFieldPending,
		regenerateProductImages,
		setPrimaryImage,
		updateProductField,
	} = useProductDetailMutations(productId, {
		onRegenerateSuccess: () => setFeaturedImageIndex(0),
	});

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Бүтээгдэхүүний дэлгэрэнгүй</DialogTitle>
						<DialogDescription>Бүтээгдэхүүний дэлгэрэнгүй мэдээлэл</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
						{isEditDialogOpen ? (
							<Suspense fallback={<ProductDetailSkeleton />}>
								<ProductForm
									onSuccess={() => {
										setIsEditDialogOpen(false);
									}}
									product={{
										...product,
										brandId: String(product.brandId),
										categoryId: String(product.categoryId),
										expirationDate: product.expirationDate ?? undefined,
										name_mn: product.name_mn ?? undefined,
										seoDescription: product.seoDescription ?? undefined,
										seoTitle: product.seoTitle ?? undefined,
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
						<div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
							<Link
								className="hover:text-foreground flex items-center gap-1.5 transition-colors"
								to="/products"
							>
								<ArrowLeft className="h-3.5 w-3.5" />
								Бүтээгдэхүүн
							</Link>
							<span>/</span>
							<span className="text-foreground max-w-[200px] truncate">{product.name}</span>
						</div>

						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-3">
									<h1 className="font-heading truncate text-xl sm:text-2xl md:text-3xl">
										{product.name}
									</h1>
								</div>
								<p className="text-muted-foreground mt-1 font-mono text-xs sm:text-sm">
									{product.slug}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<EditableField
									className={`rounded-full border px-3 py-1 text-sm font-medium ${getStatusColor(product.status)}`}
									isLoading={isUpdateProductFieldPending}
									label=""
									onSave={async (next) => {
										await updateProductField({
											field: "status",
											id: productId,
											stringValue: next,
										});
									}}
									options={[
										{ label: "Идэвхтэй", value: "active" },
										{ label: "Ноорог", value: "draft" },
										{ label: "Дууссан", value: "out_of_stock" },
									]}
									type="select"
									value={product.status}
								/>
								<RowAction
									deleteMutation={(id) => deleteProduct({ id })}
									id={productId}
									isDeletePending={isDeletePending}
									setIsEditDialogOpen={setIsEditDialogOpen}
								/>
							</div>
						</div>
					</div>

					{product.stock < 10 && (
						<div className="border-destructive bg-destructive/10 mb-6 flex items-center gap-3 border-2 p-3 sm:p-4">
							<AlertCircle className="text-destructive h-5 w-5 shrink-0" />
							<div className="min-w-0 flex-1">
								<span className="font-heading text-destructive text-sm font-bold">
									Нөөц дуусч байна
								</span>
								<span className="text-destructive/80 ml-2 text-sm">
									Зөвхөн {product.stock} ширхэг үлдсэн. Удахгүй нөөц нэмэх хэрэгтэй.
								</span>
							</div>
						</div>
					)}

					<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						<div className="border-border bg-card shadow-hard-sm border-2 p-3">
							<div className="flex items-center gap-2">
								<div className="border-border bg-primary/20 flex h-8 w-8 items-center justify-center border-2">
									<DollarSign className="text-primary-foreground h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-heading truncate text-sm font-bold sm:text-base">
										{formatCurrency(Number(product.price))}
									</p>
									<p className="text-muted-foreground text-xs">Үнэ</p>
								</div>
							</div>
						</div>
						<div className="border-border bg-card shadow-hard-sm border-2 p-3">
							<div className="flex items-center gap-2">
								<div
									className={`border-border flex h-8 w-8 items-center justify-center border-2 ${product.stock < 10 ? "bg-destructive/20" : "bg-[#00ff88]/20"}`}
								>
									<Package
										className={`h-4 w-4 ${product.stock < 10 ? "text-destructive" : "text-foreground"}`}
									/>
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-heading text-sm font-bold sm:text-base">{product.stock}</p>
									<p className="text-muted-foreground text-xs">Нөөц</p>
								</div>
							</div>
						</div>
						<Link
							className="border-border bg-card shadow-hard-sm hover:bg-muted/40 border-2 p-3 transition-colors"
							to="/restock-waitlist"
						>
							<div className="flex items-center gap-2">
								<div className="border-border bg-primary/15 flex h-8 w-8 items-center justify-center border-2">
									<Bell className="text-foreground h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-heading text-sm font-bold sm:text-base">
										{restockWait.waitCount}
									</p>
									<p className="text-muted-foreground text-xs">Хүлээж буй</p>
								</div>
							</div>
						</Link>
						<Suspense
							fallback={
								<>
									<div className="border-border bg-card shadow-hard-sm border-2 p-3">
										<div className="flex items-center gap-2">
											<div className="border-border flex h-8 w-8 items-center justify-center border-2 bg-purple-100">
												<Eye className="h-4 w-4 text-purple-600" />
											</div>
											<div className="min-w-0 flex-1">
												<Skeleton className="h-5 w-12" />
												<p className="text-muted-foreground text-xs">Үзэлт</p>
											</div>
										</div>
									</div>
									<div className="border-border bg-card shadow-hard-sm border-2 p-3">
										<div className="flex items-center gap-2">
											<div className="border-border flex h-8 w-8 items-center justify-center border-2 bg-blue-100">
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
								addImage={addImage}
								currentFeaturedImage={currentFeaturedImage}
								deleteImage={deleteImage}
								featuredImageIndex={featuredImageIndex}
								isDeleteImagePending={isDeleteImagePending}
								isRegenerateProductImagesPending={isRegenerateProductImagesPending}
								isSetPrimaryImagePending={isSetPrimaryImagePending}
								onFeaturedImageChange={setFeaturedImageIndex}
								product={product}
								productId={productId}
								regenerateProductImages={regenerateProductImages}
								setPrimaryImage={setPrimaryImage}
							/>

							<div className="border-border bg-card shadow-hard border-2">
								<div className="border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="font-heading flex items-center gap-2 text-base sm:text-lg">
										<Package className="h-4 w-4" />
										Үндсэн мэдээлэл
									</h2>
								</div>

								<div className="divide-border divide-y-2">
									<div className="px-4 py-4 sm:px-6">
										<EditableField
											isLoading={isUpdateProductFieldPending}
											label="Нэр:"
											onSave={async (next) => {
												await updateProductField({
													field: "name",
													id: productId,
													stringValue: next,
												});
											}}
											value={product.name}
										/>
									</div>

									<div className="px-4 py-4 sm:px-6">
										<EditableField
											isLoading={isUpdateProductFieldPending}
											label="Тайлбар:"
											onSave={async (next) => {
												await updateProductField({
													field: "description",
													id: productId,
													stringValue: next,
												});
											}}
											type="textarea"
											value={product.description}
										/>
									</div>

									<div className="divide-border grid grid-cols-1 divide-y-2 sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
										<div className="px-4 py-4 sm:px-6">
											<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
												<span className="text-muted-foreground w-24 shrink-0 text-sm font-semibold sm:w-32">
													Ангилал:
												</span>
												<span className="text-base font-medium">
													{product.category?.name || (
														<span className="text-muted-foreground/50">Тодорхойлоогүй</span>
													)}
												</span>
											</div>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
												<span className="text-muted-foreground w-24 shrink-0 text-sm font-semibold sm:w-32">
													Брэнд:
												</span>
												<span className="text-base font-medium">
													{product.brand?.name || (
														<span className="text-muted-foreground/50">Тодорхойлоогүй</span>
													)}
												</span>
											</div>
										</div>
									</div>

									<div className="divide-border grid grid-cols-1 divide-y-2 sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												format={(v) => formatCurrency(Number(v))}
												isLoading={isUpdateProductFieldPending}
												label="Үнэ:"
												onSave={async (next) => {
													await updateProductField({
														field: "price",
														id: productId,
														numberValue: next,
													});
												}}
												parse={(raw) => parseNonNegativeNumber(raw)}
												type="number"
												value={product.price}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												isLoading={isUpdateProductFieldPending}
												label="Нөөц:"
												onSave={async (next) => {
													await updateProductField({
														field: "stock",
														id: productId,
														numberValue: next,
													});
												}}
												parse={(raw) => parseNonNegativeInt(raw)}
												type="number"
												value={product.stock}
											/>
										</div>
									</div>
								</div>
							</div>

							<div className="border-border bg-card shadow-hard border-2">
								<div className="border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="font-heading flex items-center gap-2 text-base sm:text-lg">
										<Info className="h-4 w-4" />
										Нэмэлт мэдээлэл
									</h2>
								</div>

								<div className="divide-border grid grid-cols-1 divide-y-2 sm:grid-cols-2 sm:divide-y-0">
									<div className="divide-border sm:border-border divide-y-2 sm:border-r-2">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												isLoading={isUpdateProductFieldPending}
												label="Хэмжээ:"
												onSave={async (next) => {
													await updateProductField({
														field: "amount",
														id: productId,
														stringValue: next,
													});
												}}
												value={product.amount}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												isLoading={isUpdateProductFieldPending}
												label="Идэмхий чанар:"
												onSave={async (next) => {
													await updateProductField({
														field: "potency",
														id: productId,
														stringValue: next,
													});
												}}
												value={product.potency}
											/>
										</div>
									</div>
									<div className="divide-border divide-y-2">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												format={(value) => formatExpirationMonthYear(value || null)}
												isLoading={isUpdateProductFieldPending}
												label="Дуусах хугацаа:"
												onSave={async (next) => {
													await updateProductField({
														field: "expirationDate",
														id: productId,
														stringValue: next || undefined,
													});
												}}
												type="month"
												value={product.expirationDate || ""}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												isLoading={isUpdateProductFieldPending}
												label="Өдрийн хэрэглээ:"
												onSave={async (next) => {
													await updateProductField({
														field: "dailyIntake",
														id: productId,
														numberValue: next,
													});
												}}
												parse={(raw) => parseNonNegativeNumber(raw)}
												type="number"
												value={product.dailyIntake}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												format={(value) => `${value}%`}
												isLoading={isUpdateProductFieldPending}
												label="Хөнгөлөлт:"
												onSave={async (next) => {
													await updateProductField({
														field: "discount",
														id: productId,
														numberValue: next,
													});
												}}
												parse={(raw) => parseNonNegativeInt(raw)}
												type="number"
												value={product.discount}
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
