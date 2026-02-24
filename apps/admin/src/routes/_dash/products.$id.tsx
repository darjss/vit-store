import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	BarChart3,
	Calendar,
	Check,
	DollarSign,
	Eye,
	Image as ImageIcon,
	Info,
	Loader2,
	Package,
	Phone,
	ShoppingCart,
	Sparkles,
	Star,
	Trash2,
	TrendingUp,
} from "lucide-react";
import { Suspense, useState } from "react";
import { EditableField } from "@/components/editable-field";
import ProductDetailSkeleton from "@/components/product/product-detail-skeleton";
import ProductForm from "@/components/product/product-form";
import RowAction from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LineChart } from "@/components/ui/line-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadButton } from "@/components/upload-button";
import { formatCurrency, formatDateToText, getStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/products/$id")({
	component: RouteComponent,
	loader: ({ context: ctx, params }) => {
		const productId = Number(params.id);
		// Fire off prefetches but don't await them — navigation is instant,
		// and the Suspense boundary in the component shows a skeleton while data loads.
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.getProductById.queryOptions({ id: productId }),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.order.getRecentOrdersByProductId.queryOptions({
				productId: productId,
			}),
		);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.analytics.getProductBehavior.queryOptions({
				productId: productId,
				timeRange: "weekly",
			}),
		);
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<ProductDetailSkeleton />}>
			<ProductDetailContent />
		</Suspense>
	);
}

function ProductDetailContent() {
	const { id } = Route.useParams();
	const productId = Number(id);
	const queryClient = useQueryClient();

	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [featuredImageIndex, setFeaturedImageIndex] = useState(0);

	const { data: product } = useSuspenseQuery({
		...trpc.product.getProductById.queryOptions({ id: productId }),
	});
	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		},
	});
	const { mutate: updateProductField, isPending: isUpdateProductFieldPending } =
		useMutation({
			...trpc.product.updateProductField.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.product.getProductById.queryOptions({ id: productId }),
				);
			},
		});
	const { mutate: deleteImage, isPending: isDeleteImagePending } = useMutation({
		...trpc.image.deleteImage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
		},
	});
	const { mutate: addImage } = useMutation({
		...trpc.image.addImage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
		},
	});
	const {
		mutate: regenerateProductImages,
		isPending: isRegenerateProductImagesPending,
	} = useMutation({
		...trpc.aiProduct.regenerateProductImages.mutationOptions(),
		onSuccess: () => {
			setFeaturedImageIndex(0);
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
		},
	});
	const { mutate: setPrimaryImage, isPending: isSetPrimaryImagePending } =
		useMutation({
			...trpc.image.setPrimaryImage.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.product.getProductById.queryOptions({ id: productId }),
				);
			},
		});
	const deleteHelper = async (id: number) => {
		deleteProduct({ id });
	};

	const primaryImage = product.images?.find((img) => img.isPrimary);
	const currentFeaturedImage =
		product.images?.[featuredImageIndex] || primaryImage;

	const formatExpirationMonthYear = (value?: string | null) => {
		if (!value) return "Тодорхойлоогүй";
		const [year, month] = value.split("-");
		if (!year || !month) return value;
		return `${month}/${year}`;
	};

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
								queryClient.invalidateQueries(
									trpc.product.getAllProducts.queryOptions(),
								);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
				<div className="mx-auto w-full max-w-7xl">
					{/* Header */}
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
									onSave={(next) =>
										updateProductField({
											id: productId,
											field: "status",
											stringValue: next,
										})
									}
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

					{/* Low Stock Alert */}
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

					{/* Quick Stats Bar */}
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
							<BehaviorStatCards productId={productId} />
						</Suspense>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						{/* Left Column - 2/3 */}
						<div className="space-y-6 lg:col-span-2">
							{/* Images Section */}
							<div className="border-2 border-border bg-card shadow-hard">
								<div className="flex items-center justify-between border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="flex items-center gap-2 font-heading text-base sm:text-lg">
										<ImageIcon className="h-4 w-4" />
										Зурагнууд
										{product.images && product.images.length > 0 && (
											<span className="ml-1 border-2 border-border bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
												{product.images.length}
											</span>
										)}
									</h2>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() =>
												regenerateProductImages({
													productId,
												})
											}
											disabled={isRegenerateProductImagesPending}
											className="gap-1.5"
										>
											{isRegenerateProductImagesPending ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<Sparkles className="h-3.5 w-3.5" />
											)}
											AI дахин татах
										</Button>
										<UploadButton
											category="product"
											onSuccess={(url) => {
												addImage({
													productId: productId,
													url: url,
												});
											}}
										/>
									</div>
								</div>

								<div className="p-4 sm:p-6">
									{product.images && product.images.length > 0 ? (
										<div className="flex flex-col gap-4 sm:flex-row">
											{/* Featured Image */}
											<div className="relative aspect-square w-full overflow-hidden border-2 border-border bg-muted sm:w-64 sm:shrink-0 md:w-80">
												{currentFeaturedImage && (
													<img
														src={currentFeaturedImage.url}
														alt={`Product ${currentFeaturedImage.id}`}
														className="h-full w-full object-cover"
													/>
												)}
												{currentFeaturedImage?.isPrimary && (
													<div className="absolute top-0 left-0 border-border border-r-2 border-b-2 bg-primary px-2 py-1 font-heading text-primary-foreground text-xs">
														<Star className="mr-1 inline-block h-3 w-3" />
														Үндсэн
													</div>
												)}
											</div>

											{/* Thumbnail Grid */}
											<div className="grid flex-1 auto-rows-min grid-cols-4 gap-2 sm:grid-cols-3 md:grid-cols-4">
												{product.images.map((image, index) => (
													<div key={image.id} className="group relative">
														<button
															type="button"
															onClick={() => setFeaturedImageIndex(index)}
															className={`aspect-square w-full overflow-hidden border-2 transition-all ${
																index === featuredImageIndex
																	? "border-primary shadow-hard-sm"
																	: "border-border hover:border-foreground/50"
															}`}
														>
															<img
																src={image.url}
																alt={`Product ${image.id}`}
																className="h-full w-full object-cover"
															/>
														</button>
														{/* Hover Actions */}
														<div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
															{!image.isPrimary && (
																<Button
																	onClick={() =>
																		setPrimaryImage({
																			productId: productId,
																			imageId: image.id,
																		})
																	}
																	size="icon"
																	variant="secondary"
																	className="h-7 w-7 bg-white/90 hover:bg-white"
																	disabled={isSetPrimaryImagePending}
																>
																	{isSetPrimaryImagePending ? (
																		<Loader2 className="h-3 w-3 animate-spin" />
																	) : (
																		<Check className="h-3 w-3" />
																	)}
																</Button>
															)}
															<Button
																onClick={() =>
																	deleteImage({
																		id: image.id,
																	})
																}
																size="icon"
																variant="destructive"
																className="h-7 w-7 bg-red-500/90 hover:bg-red-500"
																disabled={isDeleteImagePending}
															>
																{isDeleteImagePending ? (
																	<Loader2 className="h-3 w-3 animate-spin" />
																) : (
																	<Trash2 className="h-3 w-3" />
																)}
															</Button>
														</div>
														{image.isPrimary && (
															<div className="absolute right-0 bottom-0 bg-primary p-0.5">
																<Star className="h-2.5 w-2.5 text-primary-foreground" />
															</div>
														)}
													</div>
												))}
											</div>
										</div>
									) : (
										<div className="flex flex-col items-center justify-center border-2 border-border border-dashed bg-muted/20 py-12">
											<ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/40" />
											<p className="font-heading text-muted-foreground text-sm">
												Зураг байршуулаагүй байна
											</p>
											<p className="mt-1 text-muted-foreground/60 text-xs">
												Дээрх товчийг ашиглан зураг нэмнэ үү
											</p>
										</div>
									)}
								</div>
							</div>

							{/* Product Information */}
							<div className="border-2 border-border bg-card shadow-hard">
								<div className="border-border border-b-2 px-4 py-3 sm:px-6">
									<h2 className="flex items-center gap-2 font-heading text-base sm:text-lg">
										<Package className="h-4 w-4" />
										Үндсэн мэдээлэл
									</h2>
								</div>

								<div className="divide-y-2 divide-border">
									{/* Name */}
									<div className="px-4 py-4 sm:px-6">
										<EditableField
											label="Нэр:"
											value={product.name}
											isLoading={isUpdateProductFieldPending}
											onSave={(next) =>
												updateProductField({
													id: productId,
													field: "name",
													stringValue: next,
												})
											}
										/>
									</div>

									{/* Description */}
									<div className="px-4 py-4 sm:px-6">
										<EditableField
											label="Тайлбар:"
											type="textarea"
											value={product.description}
											isLoading={isUpdateProductFieldPending}
											onSave={(next) =>
												updateProductField({
													id: productId,
													field: "description",
													stringValue: next,
												})
											}
										/>
									</div>

									{/* Category & Brand */}
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

									{/* Price & Stock */}
									<div className="grid grid-cols-1 divide-y-2 divide-border sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Үнэ:"
												type="number"
												value={product.price}
												format={(cents) => formatCurrency(Number(cents))}
												parse={(raw) =>
													Math.round(
														Number.parseFloat(raw || "0") * 100,
													) as unknown as string as never
												}
												isLoading={isUpdateProductFieldPending}
												onSave={(nextCents) =>
													updateProductField({
														id: productId,
														field: "price",
														numberValue: nextCents,
													})
												}
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
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "stock",
														numberValue: next,
													})
												}
											/>
										</div>
									</div>
								</div>
							</div>

							{/* Additional Details */}
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
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "amount",
														stringValue: next,
													})
												}
											/>
										</div>
										<div className="px-4 py-4 sm:px-6">
											<EditableField
												label="Идэмхий чанар:"
												value={product.potency}
												isLoading={isUpdateProductFieldPending}
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "potency",
														stringValue: next,
													})
												}
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
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "expirationDate",
														stringValue: next || undefined,
													})
												}
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
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "dailyIntake",
														numberValue: next,
													})
												}
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
												onSave={(next) =>
													updateProductField({
														id: productId,
														field: "discount",
														numberValue: next,
													})
												}
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Right Column - 1/3 */}
						<div className="space-y-6">
							{/* Analytics */}
							<Suspense fallback={<AnalyticsSkeleton />}>
								<ProductAnalyticsSection productId={productId} />
							</Suspense>

							{/* Recent Orders */}
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

function BehaviorStatCards({ productId }: { productId: number }) {
	const { data: productBehavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({
			productId,
			timeRange: "weekly",
		}),
	});

	const conversionRate =
		productBehavior.views > 0
			? (
					(productBehavior.addToCartCount / productBehavior.views) *
					100
				).toFixed(1)
			: "0";

	return (
		<>
			<div className="border-2 border-border bg-card p-3 shadow-hard-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center border-2 border-border bg-purple-100">
						<Eye className="h-4 w-4 text-purple-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-bold font-heading text-sm sm:text-base">
							{productBehavior.views.toLocaleString()}
						</p>
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
						<p className="font-bold font-heading text-sm sm:text-base">
							{conversionRate}%
						</p>
						<p className="text-muted-foreground text-xs">Хувь</p>
					</div>
				</div>
			</div>
		</>
	);
}

function ProductAnalyticsSection({ productId }: { productId: number }) {
	const { data: productBehavior } = useSuspenseQuery({
		...trpc.analytics.getProductBehavior.queryOptions({
			productId,
			timeRange: "weekly",
		}),
	});

	const conversionRate =
		productBehavior.views > 0
			? (
					(productBehavior.addToCartCount / productBehavior.views) *
					100
				).toFixed(1)
			: "0";

	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>

			<div className="p-4">
				<div className="space-y-3">
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<Eye className="h-3.5 w-3.5 text-purple-600" />
							<span className="text-muted-foreground text-xs">Нийт үзэлт</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.views.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-3.5 w-3.5 text-green-600" />
							<span className="text-muted-foreground text-xs">
								Давтагдашгүй үзэгч
							</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.uniqueViewers.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5">
						<div className="flex items-center gap-2">
							<ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
							<span className="text-muted-foreground text-xs">
								Сагсанд нэмсэн
							</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{productBehavior.addToCartCount.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between border-2 border-primary bg-primary/10 p-2.5">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-3.5 w-3.5 text-primary-foreground" />
							<span className="font-medium text-xs">Хөрвүүлэлтийн хувь</span>
						</div>
						<span className="font-bold font-heading text-sm">
							{conversionRate}%
						</span>
					</div>
				</div>

				<div className="mt-4 border-2 border-border bg-muted/10 p-3">
					<h3 className="mb-2 font-heading text-muted-foreground text-xs uppercase tracking-wider">
						7 хоногийн чиг хандлага
					</h3>
					<LineChart
						data={productBehavior.dailyTrend.map((d) => ({
							date: d.date.slice(5),
							views: d.views,
							addToCarts: d.addToCarts,
						}))}
						index="date"
						categories={["views", "addToCarts"]}
						strokeColors={["hsl(var(--primary))", "hsl(var(--chart-2))"]}
						className="h-28 sm:h-32"
					/>
				</div>
			</div>
		</div>
	);
}

function ProductOrdersSection({ productId }: { productId: number }) {
	const { data: orders } = useSuspenseQuery({
		...trpc.order.getRecentOrdersByProductId.queryOptions({
			productId,
		}),
	});

	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<Calendar className="h-4 w-4" />
					Сүүлийн захиалгууд
				</h2>
			</div>

			<div className="divide-y-2 divide-border">
				{orders.length > 0 ? (
					orders.map((order) => (
						<div
							key={order.orderNumber}
							className="px-4 py-3 transition-colors hover:bg-muted/20"
						>
							<div className="mb-1.5 flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<Phone className="h-3 w-3 text-muted-foreground" />
									<span className="font-medium text-sm">
										{order.customerPhone}
									</span>
								</div>
								<Badge className="bg-green-100 text-green-800 text-xs">
									{order.status}
								</Badge>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<Calendar className="h-3 w-3" />
									<span>{formatDateToText(order.createdAt)}</span>
								</div>
								<span className="font-bold font-heading text-primary-foreground text-sm">
									{formatCurrency(order.total)}
								</span>
							</div>
							<p className="mt-0.5 font-mono text-muted-foreground text-xs">
								{order.orderNumber}
							</p>
						</div>
					))
				) : (
					<div className="px-4 py-8 text-center">
						<ShoppingCart className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
						<p className="text-muted-foreground text-sm">Захиалга байхгүй</p>
					</div>
				)}
			</div>

			{orders.length > 0 && (
				<div className="border-border border-t-2 p-3">
					<Button variant="outline" size="sm" className="w-full text-xs">
						Бүх захиалгыг харах
					</Button>
				</div>
			)}
		</div>
	);
}

function AnalyticsSkeleton() {
	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<BarChart3 className="h-4 w-4" />
					Аналитик
				</h2>
			</div>
			<div className="p-4">
				<div className="space-y-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center justify-between border-2 border-border bg-muted/20 p-2.5"
						>
							<div className="flex items-center gap-2">
								<Skeleton className="h-3.5 w-3.5" />
								<Skeleton className="h-3 w-20" />
							</div>
							<Skeleton className="h-4 w-10" />
						</div>
					))}
				</div>
				<div className="mt-4 border-2 border-border bg-muted/10 p-3">
					<Skeleton className="mb-2 h-3 w-32" />
					<Skeleton className="h-28 w-full sm:h-32" />
				</div>
			</div>
		</div>
	);
}

function OrdersSkeleton() {
	return (
		<div className="border-2 border-border bg-card shadow-hard">
			<div className="border-border border-b-2 px-4 py-3">
				<h2 className="flex items-center gap-2 font-heading text-base">
					<Calendar className="h-4 w-4" />
					Сүүлийн захиалгууд
				</h2>
			</div>
			<div className="divide-y-2 divide-border">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={i} className="px-4 py-3">
						<div className="mb-1.5 flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-3 w-3" />
								<Skeleton className="h-4 w-24" />
							</div>
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
						<div className="flex items-center justify-between">
							<Skeleton className="h-3 w-28" />
							<Skeleton className="h-4 w-16" />
						</div>
						<Skeleton className="mt-1 h-3 w-32" />
					</div>
				))}
			</div>
		</div>
	);
}
