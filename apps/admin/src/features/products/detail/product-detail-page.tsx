import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { EditableField } from "@/components/editable-field";
import { FilterChip } from "@/components/filter-chip";
import ProductDetailSkeleton from "@/components/product/product-detail-skeleton";
import ProductForm from "@/components/product/product-form";
import { StockStepper } from "@/components/product/stock-stepper";
import RowAction from "@/components/row-actions";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProductDetailMutations } from "@/features/products/detail/hooks/use-product-detail-mutations";
import { useProductFeaturedImage } from "@/features/products/detail/hooks/use-product-featured-image";
import {
	AnalyticsSkeleton,
	ProductAnalyticsSection,
} from "@/features/products/detail/sections/product-analytics-section";
import { ProductDetailImagesSection } from "@/features/products/detail/sections/product-images-section";
import {
	OrdersSkeleton,
	ProductOrdersSection,
} from "@/features/products/detail/sections/product-orders-section";
import { calcConversionRate } from "@/features/products/detail/utils/conversion-rate";
import { productStatusLabel } from "@/lib/enum-labels";
import { cn, formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

function StockRow({ productId, stock }: { productId: number; stock: number }) {
	const note =
		stock === 0
			? { className: "text-red-700", text: "Дууссан" }
			: stock <= 2
				? { className: "text-amber-700", text: "Цөөн" }
				: { className: "text-foreground", text: `${stock} ширхэг` };
	return (
		<div className="flex items-center gap-3 px-4 py-2.5">
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs">Үлдэгдэл</p>
				<p className={cn("text-sm font-medium", note.className)}>{note.text}</p>
			</div>
			<StockStepper key={stock} productId={productId} stock={stock} />
		</div>
	);
}

function formatExpirationMonthYear(value?: string | null) {
	if (!value) {
		return "";
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

type ProductStatusType = keyof typeof productStatusLabel;

const statusOptions: Array<{ label: string; value: ProductStatusType }> = [
	{ label: productStatusLabel.active, value: "active" },
	{ label: productStatusLabel.draft, value: "draft" },
	{ label: productStatusLabel.out_of_stock, value: "out_of_stock" },
];

export function ProductDetailPage({ productId }: { productId: number }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { data: product } = useSuspenseQuery({
		...trpc.product.getProductById.queryOptions({ id: productId }),
	});
	const { data: restockWait } = useSuspenseQuery({
		...trpc.product.getRestockWaitCount.queryOptions({ productId }),
	});
	const { data: behavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({ productId, timeRange: "weekly" }),
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

	const saveString = (field: "amount" | "description" | "name" | "potency") => (next: string) =>
		updateProductField({ field, id: productId, stringValue: next });

	return (
		<>
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Бараа засах</DialogTitle>
						<DialogDescription>{product.name}</DialogDescription>
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

			<div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4">
				<div className="space-y-3 lg:space-y-4">
					<section className="border bg-white">
						<div className="flex gap-3 p-3">
							<div className="size-28 shrink-0 border bg-white p-1 md:size-40">
								{currentFeaturedImage ? (
									<img
										alt=""
										className="h-full w-full object-contain"
										src={currentFeaturedImage.url}
									/>
								) : null}
							</div>
							<div className="flex min-w-0 flex-1 flex-col">
								<h1 className="line-clamp-3 text-base leading-snug font-semibold md:text-lg">
									{product.name}
								</h1>
								<p className="text-muted-foreground mt-1 truncate text-sm">
									{product.brand?.name ?? "Брэндгүй"} · {product.category?.name ?? "Ангилалгүй"}
								</p>
								<div className="mt-auto flex items-center gap-1 pt-2">
									<FilterChip<ProductStatusType>
										idle={product.status}
										label={productStatusLabel[product.status]}
										onChange={(next) =>
											updateProductField({ field: "status", id: productId, stringValue: next })
										}
										options={statusOptions}
										value={product.status}
									/>
									<div className="flex-1" />
									<RowAction
										compact
										deleteMutation={(id) => deleteProduct({ id })}
										id={productId}
										isDeletePending={isDeletePending}
										setIsEditDialogOpen={setIsEditDialogOpen}
									/>
								</div>
							</div>
						</div>

						<div className="divide-y border-t">
							<EditableField
								format={(v) => formatCurrency(Number(v))}
								isLoading={isUpdateProductFieldPending}
								label="Үнэ"
								onSave={(next) =>
									updateProductField({ field: "price", id: productId, numberValue: next })
								}
								parse={parseNonNegativeNumber}
								renderDisplay={(v) => (
									<span className="text-xl font-bold tabular-nums">
										{formatCurrency(Number(v))}
										{product.compareAtPrice ? (
											<span className="text-muted-foreground ml-2 text-sm font-normal line-through">
												{formatCurrency(product.compareAtPrice)}
											</span>
										) : null}
									</span>
								)}
								type="number"
								value={product.price}
							/>
							<StockRow productId={productId} stock={product.stock} />
						</div>

						<div className="grid grid-cols-3 divide-x border-t text-center">
							<Link className="active:bg-muted px-2 py-2" to="/restock-waitlist">
								<p className="text-base font-semibold tabular-nums">{restockWait.waitCount}</p>
								<p className="text-muted-foreground text-xs">хүлээж буй</p>
							</Link>
							<div className="px-2 py-2">
								<p className="text-base font-semibold tabular-nums">
									{behavior.views.toLocaleString("en-US")}
								</p>
								<p className="text-muted-foreground text-xs">үзэлт, 7 хоног</p>
							</div>
							<div className="px-2 py-2">
								<p className="text-base font-semibold tabular-nums">
									{calcConversionRate(behavior.views, behavior.addToCartCount)}%
								</p>
								<p className="text-muted-foreground text-xs">сагсанд хийсэн</p>
							</div>
						</div>
					</section>

					<ProductDetailImagesSection
						addImage={addImage}
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

					<section className="border bg-white">
						<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
							Мэдээлэл
						</h2>
						<div className="divide-y">
							<EditableField
								isLoading={isUpdateProductFieldPending}
								label="Нэр"
								onSave={saveString("name")}
								value={product.name}
							/>
							<EditableField
								isLoading={isUpdateProductFieldPending}
								label="Тайлбар"
								onSave={saveString("description")}
								renderDisplay={(value) => <span className="line-clamp-4">{value}</span>}
								type="textarea"
								value={product.description}
							/>
							<div className="grid grid-cols-2 divide-x">
								<EditableField
									isLoading={isUpdateProductFieldPending}
									label="Хэмжээ"
									onSave={saveString("amount")}
									value={product.amount}
								/>
								<EditableField
									isLoading={isUpdateProductFieldPending}
									label="Идэмхий чанар"
									onSave={saveString("potency")}
									value={product.potency}
								/>
							</div>
							<div className="grid grid-cols-2 divide-x">
								<EditableField
									format={(value) => formatExpirationMonthYear(value || null)}
									isLoading={isUpdateProductFieldPending}
									label="Дуусах хугацаа"
									onSave={(next) =>
										updateProductField({
											field: "expirationDate",
											id: productId,
											stringValue: next || undefined,
										})
									}
									type="month"
									value={product.expirationDate || ""}
								/>
								<EditableField
									isLoading={isUpdateProductFieldPending}
									label="Өдрийн хэрэглээ"
									onSave={(next) =>
										updateProductField({ field: "dailyIntake", id: productId, numberValue: next })
									}
									parse={parseNonNegativeNumber}
									type="number"
									value={product.dailyIntake}
								/>
							</div>
							<EditableField
								format={(value) =>
									Number(value) > 0 ? formatCurrency(Number(value)) : "Хямдралгүй"
								}
								isLoading={isUpdateProductFieldPending}
								label="Хямдралын өмнөх үнэ"
								onSave={(next) =>
									updateProductField({ field: "compareAtPrice", id: productId, numberValue: next })
								}
								parse={parseNonNegativeInt}
								type="number"
								value={product.compareAtPrice ?? 0}
							/>
						</div>
						<p className="text-muted-foreground border-t px-4 py-2 text-[11px] break-all">
							{product.slug}
						</p>
					</section>
				</div>

				<div className="space-y-3 lg:space-y-4">
					<Suspense fallback={<OrdersSkeleton />}>
						<ProductOrdersSection productId={productId} />
					</Suspense>
					<Suspense fallback={<AnalyticsSkeleton />}>
						<ProductAnalyticsSection productId={productId} />
					</Suspense>
				</div>
			</div>
		</>
	);
}
