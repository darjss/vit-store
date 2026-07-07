import { Check, Image as ImageIcon, Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadButton } from "@/components/upload-button";
import type { RouterOutputs } from "@/lib/types";

type Product = RouterOutputs["product"]["getProductById"];

type ProductDetailImagesSectionProps = {
	productId: number;
	product: Product;
	featuredImageIndex: number;
	currentFeaturedImage: Product["images"][number] | undefined;
	onFeaturedImageChange: (index: number) => void;
	regenerateProductImages: (input: { productId: number }) => void;
	isRegenerateProductImagesPending: boolean;
	addImage: (input: { productId: number; url: string }) => void;
	setPrimaryImage: (input: { productId: number; imageId: number }) => void;
	isSetPrimaryImagePending: boolean;
	deleteImage: (input: { id: number }) => void;
	isDeleteImagePending: boolean;
};

export function ProductDetailImagesSection({
	productId,
	product,
	featuredImageIndex,
	currentFeaturedImage,
	onFeaturedImageChange,
	regenerateProductImages,
	isRegenerateProductImagesPending,
	addImage,
	setPrimaryImage,
	isSetPrimaryImagePending,
	deleteImage,
	isDeleteImagePending,
}: ProductDetailImagesSectionProps) {
	return (
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
						onClick={() => {
							console.info("aiProduct.regenerateProductImages.mutate", {
								productId,
							});
							regenerateProductImages({ productId });
						}}
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
							addImage({ productId, url });
						}}
					/>
				</div>
			</div>

			<div className="p-4 sm:p-6">
				{product.images && product.images.length > 0 ? (
					<div className="flex flex-col gap-4 sm:flex-row">
						<div className="relative aspect-square w-full overflow-hidden border-2 border-border bg-muted sm:w-64 sm:shrink-0 md:w-80">
							{currentFeaturedImage && (
								<img
									src={currentFeaturedImage.url}
									alt={`Бүтээгдэхүүн ${currentFeaturedImage.id}`}
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

						<div className="grid flex-1 auto-rows-min grid-cols-4 gap-2 sm:grid-cols-3 md:grid-cols-4">
							{product.images.map((image, index) => (
								<div key={image.id} className="group relative">
									<button
										type="button"
										onClick={() => onFeaturedImageChange(index)}
										className={`aspect-square w-full overflow-hidden border-2 transition-all ${
											index === featuredImageIndex
												? "border-primary shadow-hard-sm"
												: "border-border hover:border-foreground/50"
										}`}
									>
										<img
											src={image.url}
											alt={`Бүтээгдэхүүн ${image.id}`}
											className="h-full w-full object-cover"
										/>
									</button>
									<div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
										{!image.isPrimary && (
											<Button
												onClick={() =>
													setPrimaryImage({
														productId,
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
											onClick={() => deleteImage({ id: image.id })}
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
	);
}
